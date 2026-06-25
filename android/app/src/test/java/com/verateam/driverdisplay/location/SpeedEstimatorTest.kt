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
}
