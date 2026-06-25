package com.verateam.driverdisplay.location

import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/**
 * Validates the low-speed behaviour that the redesign targets — most importantly
 * that a stationary phone with an accelerometer bias does NOT produce ghost speed
 * (the failure mode of the earlier IMU fusion).
 */
class SpeedEstimatorTest {

    /** Stationary phone, accelerometer reports a constant 0.15 m/s² bias. Must stay ~0. */
    @Test
    fun stationaryWithBiasStaysZero() {
        val e = SpeedEstimator()
        val dt = 0.02
        var maxV = 0.0
        repeat(500) { i -> // 10 s @ 50 Hz
            e.predict(0.15, dt)
            e.applyZupt()                    // SHOE-quiet ⇒ ZUPT every step
            if (i % 50 == 0) e.correctGnss(0.0, 0.3) // GNSS says 0 each second
            maxV = maxOf(maxV, e.speedMps())
        }
        assertTrue("final speed should be ~0, was ${e.speedMps()}", e.speedMps() < 0.05)
        assertTrue("must never drift up (ghost speed), maxV=$maxV", maxV < 0.2)
    }

    /** Even without ZUPT, the Kalman bias-state must bound the drift. */
    @Test
    fun biasBoundedWithoutZupt() {
        val e = SpeedEstimator()
        val dt = 0.02
        repeat(1000) { i ->
            e.predict(0.15, dt)
            if (i % 50 == 0) e.correctGnss(0.0, 0.3)
        }
        assertTrue("drift must stay bounded, v=${e.speedMps()}", e.speedMps() < 0.3)
    }

    /** Constant cruise: converge to the GNSS speed. */
    @Test
    fun convergesToCruiseSpeed() {
        val e = SpeedEstimator()
        val dt = 0.02
        repeat(300) { i ->
            e.predict(0.0, dt)
            if (i % 50 == 0) e.correctGnss(5.0, 0.2)
        }
        assertTrue("v=${e.speedMps()}", abs(e.speedMps() - 5.0) < 0.3)
    }

    /** Responsiveness: IMU shows the change mid-way between fixes, not 1 s late. */
    @Test
    fun responsiveBetweenFixes() {
        val e = SpeedEstimator()
        val dt = 0.02
        e.correctGnss(0.0, 0.2)
        var vMid = 0.0
        repeat(50) { i -> // 1 s of 2 m/s²
            e.predict(2.0, dt)
            if (i == 24) vMid = e.speedMps()
        }
        assertTrue("mid-fix response ~1 m/s, vMid=$vMid", vMid in 0.7..1.3)
        assertTrue("reaches ~2 m/s after 1 s, v=${e.speedMps()}", e.speedMps() > 1.6)
    }

    /** Dead-band: phantom slow speed under high uncertainty → 0; a real low-uncertainty crawl is kept. */
    @Test
    fun deadbandKillsPhantomKeepsRealCrawl() {
        val phantom = SpeedEstimator()
        repeat(5) { phantom.correctGnss(0.4, 0.3) } // 0.4 < 2*0.3 ⇒ standstill
        val real = SpeedEstimator()
        repeat(5) { real.correctGnss(1.2, 0.2) }    // 1.2 > 2*0.2 ⇒ genuine crawl
        assertTrue("phantom should be ~0, was ${phantom.speedMps()}", phantom.speedMps() < 0.15)
        assertTrue("real crawl kept, was ${real.speedMps()}", abs(real.speedMps() - 1.2) < 0.3)
    }

    /** Display must track a step change quickly (light smoothing on top of the KF). */
    @Test
    fun displayTracksStepQuickly() {
        val e = SpeedEstimator()
        repeat(5) { e.correctGnss(10.0, 0.2) } // KF speed ≈ 10 m/s
        var disp = 0.0
        repeat(10) { disp = e.displaySpeedKmh(0.02) } // 0.2 s @ 50 Hz
        // target ≈ 36 km/h; must reach >34 within 0.2 s
        assertTrue("display should reach the new speed fast, was $disp", disp > 34.0)
    }

    /** When stopped, the displayed number must fall to ~0 quickly. */
    @Test
    fun displayDropsToZeroQuickly() {
        val e = SpeedEstimator()
        repeat(5) { e.correctGnss(10.0, 0.2) }
        repeat(10) { e.displaySpeedKmh(0.02) } // ramp display up
        e.applyZupt()                          // stop detected → v = 0
        var disp = 99.0
        repeat(15) { disp = e.displaySpeedKmh(0.02) } // 0.3 s
        assertTrue("display should drop to ~0 within 0.3 s, was $disp", disp < 1.0)
    }

    // ---- ZUPT gate (the bug the review caught: must not zero a moving car) ----

    private fun zupt(
        imuStationary: Boolean = true,
        hadGnssSpeed: Boolean = true,
        gnssFresh: Boolean = true,
        gnssNearZero: Boolean = true,
        hasGyro: Boolean = true,
        kfSpeedNearZero: Boolean = true,
    ) = SpeedEstimator.shouldZupt(imuStationary, hadGnssSpeed, gnssFresh, gnssNearZero, hasGyro, kfSpeedNearZero)

    @Test
    fun zuptFiresOnRealStop() {
        // Stationary + a fresh GNSS fix that says ~0 ⇒ ZUPT.
        assertTrue(zupt(gnssFresh = true, gnssNearZero = true))
    }

    @Test
    fun zuptDoesNotZeroAMovingCar() {
        // Fresh GNSS says MOVING (gnssNearZero = false) ⇒ never ZUPT, even if the
        // IMU is quiet and the KF speed is low. (The core regression.)
        assertTrue(!zupt(gnssFresh = true, gnssNearZero = false, kfSpeedNearZero = true))
    }

    @Test
    fun zuptNotBeforeFirstFix() {
        // Cold start while cruising: no speed fix yet ⇒ never pin to 0.
        assertTrue(!zupt(hadGnssSpeed = false))
    }

    @Test
    fun zuptFallsBackToKfOnlyDuringDropout() {
        // GNSS stale (dropout) + gyro present + KF near zero ⇒ allowed.
        assertTrue(zupt(gnssFresh = false, hasGyro = true, kfSpeedNearZero = true))
        // …but not while the KF still thinks it's moving.
        assertTrue(!zupt(gnssFresh = false, hasGyro = true, kfSpeedNearZero = false))
        // …and not on a gyroless device (can't veto a slow turn).
        assertTrue(!zupt(gnssFresh = false, hasGyro = false, kfSpeedNearZero = true))
    }

    @Test
    fun zuptRequiresStationary() {
        assertTrue(!zupt(imuStationary = false))
    }
}
