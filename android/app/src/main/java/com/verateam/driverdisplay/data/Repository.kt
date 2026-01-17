package com.verateam.driverdisplay.data

import android.util.Log
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import java.time.Instant
import java.time.format.DateTimeFormatter

class Repository {
    private val supabase = SupabaseClient.client

    companion object {
        private const val TAG = "Repository"
        const val RACE_STATE_ID = "00000000-0000-0000-0000-000000000001"
        const val GPS_TELEMETRY_ID = "00000000-0000-0000-0000-000000000002"
    }

    /**
     * Fetch server time in milliseconds for clock synchronization.
     * This allows the client to calculate the offset between local and server clocks.
     */
    suspend fun fetchServerTimeMs(): Long? {
        return try {
            val result = supabase.postgrest.rpc("get_server_time_ms")
                .decodeAs<Long>()
            Log.d(TAG, "Server time: $result ms")
            result
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching server time: ${e.message}")
            null
        }
    }

    // Simple fetch - no realtime, just get current state
    suspend fun fetchRaceState(): RaceState? {
        return try {
            Log.d(TAG, "Fetching race state...")
            val result = supabase.from("race_state")
                .select()
                .decodeSingleOrNull<RaceState>()
            Log.d(TAG, "Got: isRunning=${result?.isRunning}, startedAtMs=${result?.startedAtMs}")
            result
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching race state: ${e.message}")
            null
        }
    }

    // Fetch track flags
    suspend fun fetchTrackFlags(trackId: String): List<TrackFlag> {
        return try {
            supabase.from("track_flags")
                .select {
                    filter {
                        eq("track_id", trackId)
                    }
                }
                .decodeList<TrackFlag>()
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching flags: ${e.message}")
            emptyList()
        }
    }

    // Update GPS telemetry
    suspend fun updateGpsTelemetry(
        latitude: Double,
        longitude: Double,
        speed: Double,
        heading: Double,
        accuracy: Double,
        batteryLevel: Int,
        signalStrength: Int,
        isOnline: Boolean
    ): Boolean {
        return try {
            val update = GpsTelemetryUpdate(
                latitude = latitude,
                longitude = longitude,
                speed = speed,
                heading = heading,
                accuracy = accuracy,
                batteryLevel = batteryLevel,
                signalStrength = signalStrength,
                isOnline = isOnline,
                updatedAt = DateTimeFormatter.ISO_INSTANT.format(Instant.now())
            )

            supabase.from("gps_telemetry")
                .update(update) {
                    filter {
                        eq("id", GPS_TELEMETRY_ID)
                    }
                }
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error updating GPS: ${e.message}")
            false
        }
    }

    // Set online status
    suspend fun setOnlineStatus(isOnline: Boolean) {
        try {
            val update = OnlineStatusUpdate(
                isOnline = isOnline,
                updatedAt = DateTimeFormatter.ISO_INSTANT.format(Instant.now())
            )
            supabase.from("gps_telemetry")
                .update(update) {
                    filter {
                        eq("id", GPS_TELEMETRY_ID)
                    }
                }
        } catch (e: Exception) {
            Log.e(TAG, "Error setting online status: ${e.message}")
        }
    }
}
