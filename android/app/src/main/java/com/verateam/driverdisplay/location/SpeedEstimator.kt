package com.verateam.driverdisplay.location

import kotlin.math.max
import kotlin.math.pow

/**
 * Vehicle speed estimator tuned for accuracy + responsiveness at LOW speed.
 *
 * Design (grounded in GNSS/IMU fusion best practice):
 *  - GNSS Doppler speed (Location.getSpeed(), carrier-frequency based) is the
 *    accurate, ABSOLUTE source. It is cm/s-accurate even at walking pace, unlike
 *    differentiating positions (m/s-level noise at low speed).
 *  - The IMU only PREDICTS between the ~1 Hz fixes for responsiveness; it never
 *    sets the absolute level. Integrating accelerometer for absolute speed is
 *    exactly what made the earlier fusion drift: a constant bias b integrates to
 *    a velocity error b·t. Here a Kalman bias state + ZUPT cancel that bias.
 *
 * 1-D Kalman filter, state x = [v, b]:
 *    v = longitudinal speed (m/s),  b = accelerometer bias (m/s²)
 *  predict(aLon, dt):     v += (aLon − b)·dt        (IMU, ~50 Hz)
 *  correctGnss(z, sAcc):  measurement z = Doppler speed, R = sAcc²   (~1 Hz)
 *  applyZupt():           pseudo-measurement v = 0 (standstill) — clamps v AND
 *                         lets the filter observe/cancel b, resetting drift.
 *
 * Pure math, no Android imports → unit-testable on the JVM.
 */
class SpeedEstimator(
    private val qV: Double = 0.6,              // speed process noise ((m/s²)²·s)
    private val qB: Double = 1e-4,             // bias random-walk noise
    private val deadbandK: Double = 2.0,       // standstill when v < k·speedAccuracy
    private val deadbandFallbackAcc: Double = 0.5, // used when speedAccuracy unknown
    private val aLow: Double = 0.15,           // display smoothing when slow (heavy)
    private val aHigh: Double = 0.7,           // display smoothing when fast (light)
    private val refSpeedMps: Double = 8.0,     // ~29 km/h: where smoothing reaches aHigh
) {
    // State
    private var v = 0.0
    private var b = 0.0
    // Covariance P = [[pVV, pVB], [pVB, pBB]] (symmetric)
    private var pVV = 1.0
    private var pVB = 0.0
    private var pBB = 0.5

    // Display smoothing state
    private var smoothed = 0.0

    fun reset() {
        v = 0.0; b = 0.0
        pVV = 1.0; pVB = 0.0; pBB = 0.5
        smoothed = 0.0
    }

    /** IMU predict. aLon = longitudinal accel (m/s², gravity removed, projected on travel dir). */
    fun predict(aLon: Double, dt: Double) {
        if (dt <= 0.0 || dt > 1.0) return // ignore zero/huge gaps
        v += (aLon - b) * dt
        if (v < 0.0) v = 0.0

        // F = [[1, -dt], [0, 1]];  P' = F P Fᵀ + Q
        val a = pVV; val cross = pVB; val c = pBB
        pVV = a - 2.0 * dt * cross + dt * dt * c + qV * dt
        pVB = cross - dt * c
        pBB = c + qB * dt
    }

    /** GNSS Doppler correction. speedMps from Location.getSpeed(); sAccMps from speedAccuracy (<=0 ⇒ unknown). */
    fun correctGnss(speedMps: Double, sAccMps: Double) {
        val sAcc = if (sAccMps > 0.0) sAccMps else deadbandFallbackAcc
        // Uncertainty-scaled dead-band: within ~k·σ of zero ⇒ treat as standstill.
        if (speedMps < deadbandK * sAcc) {
            kalmanUpdate(0.0, 0.3 * 0.3) // soft pull to 0
        } else {
            kalmanUpdate(speedMps, sAcc * sAcc) // weight by reported uncertainty
        }
    }

    /** Zero-velocity update: hard correction to 0 (standstill confirmed by GNSS + quiet IMU). */
    fun applyZupt() {
        kalmanUpdate(0.0, 0.01 * 0.01)
    }

    /** Scalar Kalman update with H = [1, 0]. */
    private fun kalmanUpdate(z: Double, r: Double) {
        val s = pVV + r
        if (s <= 0.0) return
        val k0 = pVV / s
        val k1 = pVB / s
        val y = z - v
        v += k0 * y
        b += k1 * y
        if (v < 0.0) v = 0.0
        // P = (I − K H) P  (symmetric for a scalar update)
        val a = pVV; val cross = pVB; val c = pBB
        pVV = (1.0 - k0) * a
        pVB = (1.0 - k0) * cross
        pBB = c - k1 * cross
        if (pVV < 0.0) pVV = 0.0
        if (pBB < 0.0) pBB = 0.0
    }

    /** Filtered speed (m/s). */
    fun speedMps(): Double = max(0.0, v)

    /**
     * Display speed (km/h) with speed-adaptive, dt-aware smoothing: heavy when
     * slow (kills jitter), light when fast (no braking lag).
     */
    fun displaySpeedKmh(dt: Double): Double {
        val target = max(0.0, v)
        val t = (target / refSpeedMps).coerceIn(0.0, 1.0)
        val aBase = aLow + (aHigh - aLow) * t
        val nominalDt = 0.02 // 50 Hz output
        val a = if (dt > 0.0) (1.0 - (1.0 - aBase).pow(dt / nominalDt)).coerceIn(0.0, 1.0) else aBase
        smoothed += a * (target - smoothed)
        if (smoothed < 0.0) smoothed = 0.0
        return smoothed * 3.6
    }

    fun bias(): Double = b
}
