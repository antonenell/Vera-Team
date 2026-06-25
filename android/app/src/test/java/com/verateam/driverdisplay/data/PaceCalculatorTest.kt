package com.verateam.driverdisplay.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/**
 * The driver's example: 8 laps, 21 min duration − 60 s safety = 20 min (1200 s)
 * budget ⇒ 150 s/lap on target. Lap distance learned from GPS as 1500 m ⇒ 36 km/h.
 * The target must move with the banked ±time.
 */
class PaceCalculatorTest {

    private val budget = 1200.0      // 20 min
    private val laps = 8
    private val lapDist = 1500.0     // m, learned from GPS

    @Test
    fun onPaceAfterFirstLap() {
        val t = PaceCalculator.compute(
            totalLaps = laps, lapsCompleted = 1, targetBudgetSec = budget,
            elapsedSec = 150.0, completedLapsSec = 150.0, lapDistanceM = lapDist, odometerM = 1500.0,
        )
        assertFalse(t.calibrating); assertFalse(t.finished)
        assertEquals(0, t.bankedSeconds); assertTrue(t.onPace)
        assertTrue("target ≈ 36 km/h, was ${t.targetKmh}", abs(t.targetKmh - 36.0) < 0.5)
        assertTrue("current ≈ 36 km/h, was ${t.currentKmh}", abs(t.currentKmh - 36.0) < 0.5)
    }

    @Test
    fun aheadOnTimeLowersTheTarget() {
        // 2 laps in 280 s = 20 s ahead of the 300 s on-target → can ease off.
        val t = PaceCalculator.compute(
            totalLaps = laps, lapsCompleted = 2, targetBudgetSec = budget,
            elapsedSec = 280.0, completedLapsSec = 280.0, lapDistanceM = lapDist, odometerM = 3000.0,
        )
        assertEquals(20, t.bankedSeconds); assertTrue(t.onPace)
        assertTrue("target should drop below 36, was ${t.targetKmh}", t.targetKmh < 36.0)
    }

    @Test
    fun behindOnTimeRaisesTheTarget() {
        // 2 laps in 320 s = 20 s behind → must speed up.
        val t = PaceCalculator.compute(
            totalLaps = laps, lapsCompleted = 2, targetBudgetSec = budget,
            elapsedSec = 320.0, completedLapsSec = 320.0, lapDistanceM = lapDist, odometerM = 3000.0,
        )
        assertEquals(-20, t.bankedSeconds); assertFalse(t.onPace)
        assertTrue("target should rise above 36, was ${t.targetKmh}", t.targetKmh > 36.0)
    }

    @Test
    fun targetIsSteadyThroughTheInProgressLap() {
        // 4 perfect laps (600 s), now mid lap 5 at a live elapsed of 740 s. The target
        // must stay ~36 (driven by completed-lap time), NOT climb to ~47 with the clock.
        val t = PaceCalculator.compute(
            totalLaps = laps, lapsCompleted = 4, targetBudgetSec = budget,
            elapsedSec = 740.0, completedLapsSec = 600.0, lapDistanceM = lapDist, odometerM = 6500.0,
        )
        assertEquals(0, t.bankedSeconds); assertTrue(t.onPace)
        assertTrue("target must stay ~36 mid-lap, was ${t.targetKmh}", abs(t.targetKmh - 36.0) < 0.5)
    }

    @Test
    fun calibratesUntilLapDistanceKnown() {
        val t = PaceCalculator.compute(
            totalLaps = laps, lapsCompleted = 0, targetBudgetSec = budget,
            elapsedSec = 30.0, completedLapsSec = 0.0, lapDistanceM = 0.0, odometerM = 80.0,
        )
        assertTrue(t.calibrating)
        assertEquals(0.0, t.targetKmh, 0.0001)
    }

    @Test
    fun finishedWhenAllLapsDone() {
        val t = PaceCalculator.compute(
            totalLaps = laps, lapsCompleted = 8, targetBudgetSec = budget,
            elapsedSec = 1180.0, completedLapsSec = 1180.0, lapDistanceM = lapDist, odometerM = 12000.0,
        )
        assertTrue(t.finished)
    }

    @Test
    fun overBudgetSignalsPush() {
        // Out of time with a lap to go → unbounded required speed, capped for the UI.
        val t = PaceCalculator.compute(
            totalLaps = laps, lapsCompleted = 7, targetBudgetSec = budget,
            elapsedSec = 1250.0, completedLapsSec = 1230.0, lapDistanceM = lapDist, odometerM = 10500.0,
        )
        assertFalse(t.onPace)
        assertEquals(999.0, t.targetKmh, 0.0001)
    }
}
