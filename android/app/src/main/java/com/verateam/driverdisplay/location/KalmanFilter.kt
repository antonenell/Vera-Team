package com.verateam.driverdisplay.location

import android.location.Location
import kotlin.math.cos
import kotlin.math.sqrt

/**
 * 1D Kalman Filter for GPS coordinate smoothing.
 * Reduces GPS jitter and drift while preserving actual movement.
 *
 * Optimized for racing/driving applications with high-frequency updates.
 */
class KalmanLatLong {
    // Process noise - how much we expect the position to change between updates
    // Lower = smoother but slower to react; Higher = more responsive but noisier
    private var processNoise = 3.0 // meters per second variance

    // Measurement noise - GPS accuracy variance
    private var measurementNoise = 10.0 // Default GPS accuracy in meters

    // State estimates
    private var latitude = 0.0
    private var longitude = 0.0

    // Error covariance (uncertainty in our estimate)
    private var varianceLat = 0.0
    private var varianceLng = 0.0

    // Timestamp of last update
    private var timestampMs = 0L

    // Minimum accuracy to consider a location valid
    private val minAccuracyMeters = 50f

    /**
     * Configure filter responsiveness.
     * @param qMetersPerSecond Expected meters per second of position change
     */
    fun setProcessNoise(qMetersPerSecond: Double) {
        processNoise = qMetersPerSecond
    }

    /**
     * Reset the filter state - call when GPS signal is lost and reacquired
     */
    fun reset() {
        latitude = 0.0
        longitude = 0.0
        varianceLat = 0.0
        varianceLng = 0.0
        timestampMs = 0L
    }

    /**
     * Check if filter has been initialized with at least one location
     */
    fun isInitialized(): Boolean = timestampMs > 0

    /**
     * Process a new GPS location and return filtered coordinates.
     *
     * @param location Raw GPS location from FusedLocationProvider
     * @return Filtered location with smoothed coordinates, or null if accuracy too poor
     */
    fun filter(location: Location): Location? {
        // Reject very poor accuracy readings
        if (location.accuracy > minAccuracyMeters || location.accuracy <= 0) {
            return null
        }

        val lat = location.latitude
        val lng = location.longitude
        val accuracy = location.accuracy.toDouble()
        val currentTimeMs = location.time

        // First reading - initialize state
        if (timestampMs == 0L) {
            latitude = lat
            longitude = lng
            varianceLat = accuracy * accuracy
            varianceLng = accuracy * accuracy
            timestampMs = currentTimeMs
            return location // Return original for first reading
        }

        // Calculate time delta in seconds
        val dt = (currentTimeMs - timestampMs) / 1000.0
        timestampMs = currentTimeMs

        // Skip if time delta is too large (GPS was lost) - reset filter
        if (dt > 10.0) {
            reset()
            latitude = lat
            longitude = lng
            varianceLat = accuracy * accuracy
            varianceLng = accuracy * accuracy
            timestampMs = currentTimeMs
            return location
        }

        // Skip if time delta is zero or negative
        if (dt <= 0) {
            return createFilteredLocation(location)
        }

        // === PREDICTION STEP ===
        // Increase uncertainty based on expected movement (process noise)
        // For a moving vehicle, we expect significant position change
        val processVariance = processNoise * processNoise * dt * dt
        varianceLat += processVariance
        varianceLng += processVariance

        // === UPDATE STEP ===
        // Measurement noise from GPS accuracy
        val measurementVariance = accuracy * accuracy

        // Kalman gain: how much we trust the new measurement vs our prediction
        // Gain = predicted_variance / (predicted_variance + measurement_variance)
        val kLat = varianceLat / (varianceLat + measurementVariance)
        val kLng = varianceLng / (varianceLng + measurementVariance)

        // Update state estimate
        latitude += kLat * (lat - latitude)
        longitude += kLng * (lng - longitude)

        // Update error covariance
        varianceLat = (1 - kLat) * varianceLat
        varianceLng = (1 - kLng) * varianceLng

        return createFilteredLocation(location)
    }

    /**
     * Create a new Location object with filtered coordinates
     */
    private fun createFilteredLocation(original: Location): Location {
        return Location(original).apply {
            latitude = this@KalmanLatLong.latitude
            longitude = this@KalmanLatLong.longitude
            // Keep original speed, bearing, altitude, and time
            // Update accuracy to reflect our improved estimate
            accuracy = sqrt(varianceLat.coerceAtMost(varianceLng)).toFloat()
        }
    }

    /**
     * Get current filtered latitude
     */
    fun getLatitude(): Double = latitude

    /**
     * Get current filtered longitude
     */
    fun getLongitude(): Double = longitude

    /**
     * Get current estimated accuracy in meters
     */
    fun getAccuracy(): Float = sqrt(varianceLat.coerceAtMost(varianceLng)).toFloat()
}

/**
 * Speed smoother using exponential moving average.
 * Reduces speed value jitter while maintaining responsiveness.
 */
class SpeedSmoother(
    private val alpha: Double = 0.3 // Smoothing factor: 0.0 = very smooth, 1.0 = no smoothing
) {
    private var smoothedSpeed = 0.0
    private var initialized = false

    fun smooth(rawSpeedMps: Float): Double {
        if (!initialized || rawSpeedMps < 0.5f) {
            // Initialize or reset when stationary
            smoothedSpeed = rawSpeedMps.toDouble()
            initialized = true
            return smoothedSpeed
        }

        // Exponential moving average
        smoothedSpeed = alpha * rawSpeedMps + (1 - alpha) * smoothedSpeed
        return smoothedSpeed
    }

    fun reset() {
        smoothedSpeed = 0.0
        initialized = false
    }

    fun getSmoothedSpeed(): Double = smoothedSpeed
}

/**
 * Bearing smoother that handles 0°/360° wraparound correctly.
 */
class BearingSmoother(
    private val alpha: Double = 0.4 // Smoothing factor
) {
    private var smoothedBearing = 0.0
    private var initialized = false

    fun smooth(rawBearing: Float): Double {
        if (!initialized) {
            smoothedBearing = rawBearing.toDouble()
            initialized = true
            return smoothedBearing
        }

        // Handle 0°/360° wraparound
        var diff = rawBearing - smoothedBearing
        if (diff > 180) diff -= 360
        if (diff < -180) diff += 360

        smoothedBearing += alpha * diff

        // Normalize to 0-360 range
        if (smoothedBearing < 0) smoothedBearing += 360
        if (smoothedBearing >= 360) smoothedBearing -= 360

        return smoothedBearing
    }

    fun reset() {
        smoothedBearing = 0.0
        initialized = false
    }

    fun getSmoothedBearing(): Double = smoothedBearing
}
