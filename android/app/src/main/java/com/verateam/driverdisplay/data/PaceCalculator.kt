package com.verateam.driverdisplay.data

/**
 * Result of the target-mean-speed calculation shown to the driver.
 */
data class MeanSpeedTarget(
    /** Average speed (km/h) the driver must hold over the REMAINING laps to finish
     *  all laps within the target time. Drops as the driver banks +time, rises if behind. */
    val targetKmh: Double = 0.0,
    /** The driver's ACTUAL average speed so far (km/h), from the integrated GPS distance. */
    val currentKmh: Double = 0.0,
    /** Time banked vs the on-target pace over completed laps: +ahead / −behind (seconds). */
    val bankedSeconds: Int = 0,
    /** True until there's enough data (≥1 completed lap with measured distance) to give a target. */
    val calibrating: Boolean = true,
    /** True once all laps are done. */
    val finished: Boolean = false,
) {
    /** On or ahead of pace (the driver has banked time). */
    val onPace: Boolean get() = bankedSeconds >= 0
}

/**
 * Computes the target mean speed for an endurance/economy race: complete [totalLaps]
 * within a time budget (race duration − safety buffer). It uses BOTH the lap scores
 * (elapsed/banked time) and the real speed of the car (the GPS-integrated distance,
 * which self-calibrates the lap length — no hard-coded track length needed).
 *
 *   requiredLapTime  = (budget − elapsed) / lapsRemaining     ← reflects banked ±time
 *   targetMeanSpeed  = lapDistance / requiredLapTime          ← lapDistance from real GPS
 *
 * Pure / side-effect free so it can be unit-tested.
 */
object PaceCalculator {

    /**
     * @param totalLaps         laps in the race
     * @param lapsCompleted     laps completed so far (lapTimes.size)
     * @param targetBudgetSec   race duration minus safety buffer (seconds)
     * @param elapsedSec        live elapsed race time (seconds)
     * @param completedLapsSec  summed actual time of completed laps (for the banked figure)
     * @param lapDistanceM      measured average completed-lap distance (m); ≤0 ⇒ not yet known
     * @param odometerM         total distance driven this race (m), from ∫ GPS speed dt
     */
    fun compute(
        totalLaps: Int,
        lapsCompleted: Int,
        targetBudgetSec: Double,
        elapsedSec: Double,
        completedLapsSec: Double,
        lapDistanceM: Double,
        odometerM: Double,
    ): MeanSpeedTarget {
        val currentKmh = if (elapsedSec > 1.0 && odometerM > 0.0) odometerM / elapsedSec * 3.6 else 0.0

        val targetLapTime = if (totalLaps > 0) targetBudgetSec / totalLaps else 0.0
        // Banked time uses completed laps only (the "lap scores"): + = ahead.
        val banked = (lapsCompleted * targetLapTime - completedLapsSec).toInt()

        val lapsRemaining = (totalLaps - lapsCompleted).coerceAtLeast(0)
        if (lapsRemaining == 0) {
            return MeanSpeedTarget(0.0, currentKmh, banked, calibrating = false, finished = true)
        }
        if (lapDistanceM <= 0.0) {
            return MeanSpeedTarget(0.0, currentKmh, banked, calibrating = true, finished = false)
        }

        // Use completed-lap time (not the live clock) so the target frame matches the
        // whole-lap distance + lap count: it stays steady through each lap and only
        // steps when a lap actually completes — and agrees with the banked figure.
        val timeRemaining = targetBudgetSec - completedLapsSec
        val requiredLapTime = timeRemaining / lapsRemaining
        // If out of budget, the required speed is unbounded — cap it so the UI can show "push".
        val targetKmh = if (requiredLapTime > 0.0) (lapDistanceM / requiredLapTime * 3.6) else 999.0
        return MeanSpeedTarget(targetKmh, currentKmh, banked, calibrating = false, finished = false)
    }
}
