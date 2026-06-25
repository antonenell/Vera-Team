package com.verateam.driverdisplay.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the regression that prompted the rewrite: the old Kalman/ZUPT speed
 * estimator zeroed slowly-moving cars. Low speeds must register.
 */
class SpeedSmoothingTest {

    @Test
    fun `first reading passes straight through`() {
        assertEquals(5.0, SpeedSmoothing.smooth(0.0, 5.0, havePrevious = false), 1e-9)
    }

    @Test
    fun `a steady low speed registers and never zeroes`() {
        // 4 km/h held steady — the old dead-band (v < 2*speedAccuracy) would have zeroed this.
        var v = 0.0
        var have = false
        repeat(20) {
            v = SpeedSmoothing.smooth(v, 4.0, have)
            have = true
        }
        assertEquals(4.0, v, 0.05)
        assertTrue("low speed must stay non-zero", v > 0.0)
    }

    @Test
    fun `even a 2 km per h crawl registers`() {
        var v = 0.0
        var have = false
        repeat(20) { v = SpeedSmoothing.smooth(v, 2.0, have); have = true }
        assertTrue("a 2 km/h crawl must register", v >= 1.5)
    }

    @Test
    fun `true standstill floors to a clean zero`() {
        // Residual GNSS noise at rest (~0.4 km/h) should read 0.
        var v = 0.0
        var have = false
        repeat(10) { v = SpeedSmoothing.smooth(v, 0.4, have); have = true }
        assertEquals(0.0, v, 1e-9)
    }

    @Test
    fun `accelerating from rest climbs toward the real speed`() {
        var v = 0.0
        var have = false
        // raw jumps to 10 km/h and holds
        repeat(8) { v = SpeedSmoothing.smooth(v, 10.0, have); have = true }
        assertTrue("should be climbing, not stuck at 0", v > 5.0)
        assertTrue("should not overshoot", v <= 10.0001)
    }

    @Test
    fun `smoothing is light enough to track within a few samples`() {
        var v = 0.0
        var have = false
        repeat(5) { v = SpeedSmoothing.smooth(v, 30.0, have); have = true }
        // 5 samples of EMA(0.6) reach ~30*(1-0.4^5) ≈ 29.7
        assertTrue("EMA should be near target within 5 samples, was $v", v > 28.0)
    }
}
