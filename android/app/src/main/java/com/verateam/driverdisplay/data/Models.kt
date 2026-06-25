package com.verateam.driverdisplay.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Server-Authoritative Timer Model
 *
 * Uses timestamps instead of ticking counters to avoid clock drift.
 * All clients calculate elapsed time from the same server timestamp.
 */
@Serializable
data class RaceState(
    val id: String = "00000000-0000-0000-0000-000000000001",
    @SerialName("is_running") val isRunning: Boolean = false,
    @SerialName("started_at_ms") val startedAtMs: Long? = null,  // Server timestamp when race started
    @SerialName("paused_at_ms") val pausedAtMs: Long? = null,  // Server timestamp when race was paused (null while running or idle)
    @SerialName("paused_offset_ms") val pausedOffsetMs: Long = 0,  // Accumulated pause time
    @SerialName("start_time") val startTime: String? = null,  // Legacy field
    @SerialName("elapsed_seconds") val elapsedSeconds: Int = 0,  // Legacy field
    @SerialName("lap_times") val lapTimes: List<Int> = emptyList(),
    @SerialName("current_lap") val currentLap: Int = 1,
    @SerialName("total_race_time") val totalRaceTime: Int = 2100,
    @SerialName("total_laps") val totalLaps: Int = 11,           // defaults if column absent (pre-migration)
    @SerialName("safety_seconds") val safetySeconds: Int = 60,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class TrackFlag(
    val id: String? = null,
    @SerialName("track_id") val trackId: String,
    @SerialName("flag_id") val flagId: String,
    val color: String? = "grey",
    val lng: Double? = null,   // admin-placed position (matches the web)
    val lat: Double? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class GpsTelemetry(
    val id: String = "00000000-0000-0000-0000-000000000002",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val speed: Double = 0.0,
    val heading: Double = 0.0,
    val accuracy: Double = 0.0,
    @SerialName("battery_level") val batteryLevel: Int = 100,
    @SerialName("battery_temp") val batteryTemp: Double? = null,
    @SerialName("signal_strength") val signalStrength: Int = 0,
    @SerialName("is_online") val isOnline: Boolean = false,
    val timestamp: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

// Phone battery temperature, sent as a SEPARATE update so a missing battery_temp
// column (migration not yet applied) can't break the main telemetry.
@Serializable
data class PhoneTempUpdate(
    @SerialName("battery_temp") val batteryTemp: Double,
    @SerialName("updated_at") val updatedAt: String
)

// For updating GPS telemetry (without id)
@Serializable
data class GpsTelemetryUpdate(
    val latitude: Double,
    val longitude: Double,
    val speed: Double,
    val heading: Double,
    val accuracy: Double,
    @SerialName("battery_level") val batteryLevel: Int,
    @SerialName("signal_strength") val signalStrength: Int,
    @SerialName("is_online") val isOnline: Boolean,
    @SerialName("updated_at") val updatedAt: String
)

// For updating only online status
@Serializable
data class OnlineStatusUpdate(
    @SerialName("is_online") val isOnline: Boolean,
    @SerialName("updated_at") val updatedAt: String
)

// For clearing GPS when going offline
@Serializable
data class OfflineUpdate(
    @SerialName("is_online") val isOnline: Boolean = false,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val speed: Double = 0.0,
    val heading: Double = 0.0,
    @SerialName("updated_at") val updatedAt: String
)
