package com.verateam.driverdisplay.location

/**
 * Pure speed conditioning for the driver speedometer.
 *
 * Research conclusion (GNSS/INS): the GNSS Doppler speed the chip already gives us
 * IS the most accurate source on a phone, and it is at its STRONGEST at low, steady
 * speed (its error is a speed-independent noise floor, not worse when slow). The IMU
 * cannot improve absolute accuracy — low speed is its worst case — so it has no role
 * in the speed value. We only condition the Doppler reading:
 *
 *  - Standstill is gated by the chip's own 1σ speed accuracy, not a blunt fixed floor:
 *    a near-zero reading is shown as 0 ONLY when it's also low-confidence (σ ≥ value),
 *    so a slow-but-confident car is never zeroed — fixing the exact low-speed gripe.
 *  - Smoothing is a light EMA whose weight adapts to σ: trust the raw value in clear
 *    sky (α near 1), smooth more only when σ balloons (urban canyon / poor SNR).
 */
object SpeedSmoothing {
    const val CREEP_KMH = 1.1          // ≈0.3 m/s — only below this do we consider a reading "creep"
    const val DEFAULT_SIGMA_KMH = 1.8  // ≈0.5 m/s — typical Doppler 1σ when the chip reports none
    const val SIGMA_SMOOTH_KMH = 5.4   // ≈1.5 m/s — at/above this σ, smooth the most
    const val MIN_ALPHA = 0.35         // heaviest smoothing (poor signal)
    const val MAX_ALPHA = 0.9          // lightest smoothing (clear sky) — near-raw, responsive

    /**
     * @param sigmaKmh the chip's 1σ speed accuracy (getSpeedAccuracyMetersPerSecond·3.6),
     *                 or NaN when the fix doesn't report one.
     */
    fun smooth(previousKmh: Double, rawKmh: Double, sigmaKmh: Double, havePrevious: Boolean): Double {
        val sigma = if (sigmaKmh.isNaN() || sigmaKmh <= 0.0) DEFAULT_SIGMA_KMH else sigmaKmh

        // Parked-creep suppression — clamp a near-zero, LOW-CONFIDENCE reading to 0,
        // but let a slow-but-confident reading through (that's the low speed we want).
        if (rawKmh < CREEP_KMH && sigma >= rawKmh) return 0.0

        // Adaptive light EMA: more trust in the raw reading when σ is small.
        val alpha = (1.0 - sigma / SIGMA_SMOOTH_KMH).coerceIn(MIN_ALPHA, MAX_ALPHA)
        return if (!havePrevious) rawKmh else alpha * rawKmh + (1 - alpha) * previousKmh
    }
}
