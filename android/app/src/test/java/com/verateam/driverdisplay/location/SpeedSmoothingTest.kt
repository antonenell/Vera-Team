package com.verateam.driverdisplay.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the regression that prompted the rewrite: the old Kalman/ZUPT estimator (and a
 * blunt fixed floor) zeroed slowly-moving cars. Low speeds must register; only true,
 * low-confidence standstill is floored.
 */
class SpeedSmoothingTest {

    private val CONFIDENT = 0.7   // km/h ≈ 0.2 m/s — clear-sky 1σ
    private val POOR = 3.0        // km/h — degraded 1σ

    @Test
    fun `first reading passes straight through`() {
        assertEquals(5.0, SpeedSmoothing.smooth(0.0, 5.0, CONFIDENT, havePrevious = false), 1e-9)
    }

    @Test
    fun `a steady low speed registers and never zeroes`() {
        var v = 0.0; var have = false
        repeat(20) { v = SpeedSmoothing.smooth(v, 4.0, CONFIDENT, have); have = true }
        assertEquals(4.0, v, 0.05)
        assertTrue("low speed must stay non-zero", v > 0.0)
    }

    @Test
    fun `even a 2 km per h crawl registers`() {
        var v = 0.0; var have = false
        repeat(20) { v = SpeedSmoothing.smooth(v, 2.0, CONFIDENT, have); have = true }
        assertTrue("a 2 km/h crawl must register", v >= 1.5)
    }

    @Test
    fun `a confident sub-1kmh creep is NOT zeroed`() {
        // 0.8 km/h with a tight 1σ (0.4) is real motion the chip is sure about → show it.
        val v = SpeedSmoothing.smooth(0.8, 0.8, 0.4, havePrevious = true)
        assertTrue("a confident creep must register, was $v", v > 0.0)
    }

    @Test
    fun `parked noise with poor confidence floors to zero`() {
        // 0.5 km/h reading whose own 1σ (0.6) is bigger than the reading = noise → 0.
        var v = 0.0; var have = false
        repeat(10) { v = SpeedSmoothing.smooth(v, 0.5, 0.6, have); have = true }
        assertEquals(0.0, v, 1e-9)
    }

    @Test
    fun `accelerating from rest climbs toward the real speed`() {
        var v = 0.0; var have = false
        repeat(8) { v = SpeedSmoothing.smooth(v, 10.0, CONFIDENT, have); have = true }
        assertTrue("should be climbing, not stuck at 0", v > 5.0)
        assertTrue("should not overshoot", v <= 10.0001)
    }

    @Test
    fun `clear sky tracks fast, poor signal smooths harder`() {
        // Both blend from a known previous value (havePrevious=true) so the EMA weight,
        // not the first-reading passthrough, is what's compared.
        var fast = 0.0
        repeat(4) { fast = SpeedSmoothing.smooth(fast, 30.0, CONFIDENT, havePrevious = true) }
        var slow = 0.0
        repeat(4) { slow = SpeedSmoothing.smooth(slow, 30.0, POOR, havePrevious = true) }
        assertTrue("clear sky should track faster than poor signal ($fast vs $slow)", fast > slow)
    }

    @Test
    fun `missing speed accuracy falls back to a sane default`() {
        // NaN sigma must not crash and should behave like a moderate floor/smoothing.
        val moving = SpeedSmoothing.smooth(0.0, 12.0, Double.NaN, havePrevious = false)
        assertEquals(12.0, moving, 1e-9)
        val parked = SpeedSmoothing.smooth(0.0, 0.4, Double.NaN, havePrevious = true)
        assertEquals(0.0, parked, 1e-9)
    }
}
