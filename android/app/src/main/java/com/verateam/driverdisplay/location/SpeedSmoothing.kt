package com.verateam.driverdisplay.location

/**
 * Pure speed smoothing for the driver speedometer.
 *
 * Intentionally simple after the over-engineered Kalman/ZUPT version zeroed
 * slowly-moving cars: a light EMA removes single-sample flicker, and ONLY a true
 * standstill is floored to 0. There is no speed-accuracy dead-band, so any real
 * driving speed — including very low ones — passes straight through.
 */
object SpeedSmoothing {
    const val EMA_ALPHA = 0.6        // 0.6·new + 0.4·old — responsive, never lag-locked
    const val STANDSTILL_KMH = 1.0   // clean 0 only at rest; far below any driving speed

    fun smooth(previousKmh: Double, rawKmh: Double, havePrevious: Boolean): Double {
        val next = if (!havePrevious) rawKmh
            else EMA_ALPHA * rawKmh + (1 - EMA_ALPHA) * previousKmh
        return if (next < STANDSTILL_KMH) 0.0 else next
    }
}
