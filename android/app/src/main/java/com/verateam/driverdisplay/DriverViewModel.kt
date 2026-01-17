package com.verateam.driverdisplay

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.verateam.driverdisplay.data.RaceState
import com.verateam.driverdisplay.data.Repository
import com.verateam.driverdisplay.data.TrackFlag
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Server-Authoritative Timer Implementation for Android
 *
 * PRINCIPLE: "Send timestamps, not ticks. Calculate time, don't count it."
 *
 * How it works:
 * 1. On init, sync clock with server to calculate clockOffset
 * 2. Fetch race state periodically (only for state changes, not ticks)
 * 3. Calculate elapsed time locally using:
 *    elapsedMs = correctedNow - startedAtMs - pausedOffsetMs
 *    where correctedNow = System.currentTimeMillis() + clockOffset
 *
 * Why this avoids drift:
 * - All clients derive time from the SAME server timestamp
 * - Clock offset compensates for local clock differences
 * - Timer display updates locally (smooth animation)
 * - Late joiners immediately see correct time
 */

data class DriverUiState(
    val isLoading: Boolean = true,
    val isConnected: Boolean = false,

    // Race state
    val isRunning: Boolean = false,
    val timeLeftSeconds: Int = 2100,
    val totalRaceTime: Int = 2100,
    val currentLap: Int = 0,
    val totalLaps: Int = 11,
    val lapTimes: List<Int> = emptyList(),
    val currentLapElapsed: Int = 0,

    // GPS data
    val speed: Double = 0.0,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,

    // Flags
    val flags: List<TrackFlag> = emptyList(),
    val selectedTrack: String = "stora-holm"
)

class DriverViewModel : ViewModel() {

    private val repository = Repository()

    private val _uiState = MutableStateFlow(DriverUiState())
    val uiState: StateFlow<DriverUiState> = _uiState.asStateFlow()

    // Clock offset: serverTime - localTime
    // To get server-corrected time: System.currentTimeMillis() + clockOffset
    private var clockOffset: Long = 0L

    // Current race state from server
    private var currentRaceState: RaceState? = null

    // Timer job for local display updates
    private var timerJob: Job? = null

    companion object {
        private const val TAG = "DriverViewModel"
        private const val POLL_INTERVAL_MS = 3000L  // Poll server every 3 seconds (not for timer, just for state)
        private const val TIMER_UPDATE_INTERVAL_MS = 100L  // Update timer display every 100ms
    }

    init {
        syncClockAndStart()
    }

    /**
     * Sync clock with server, then start polling for state changes.
     * Clock sync happens once at startup to establish the offset.
     */
    private fun syncClockAndStart() {
        viewModelScope.launch {
            try {
                val localBefore = System.currentTimeMillis()
                val serverTimeMs = repository.fetchServerTimeMs()
                val localAfter = System.currentTimeMillis()

                if (serverTimeMs != null) {
                    // Estimate server time at the midpoint of our request
                    val roundTripTime = localAfter - localBefore
                    val localMidpoint = localBefore + roundTripTime / 2
                    clockOffset = serverTimeMs - localMidpoint

                    Log.i(TAG, "Clock synced: offset=${clockOffset}ms, RTT=${roundTripTime}ms")
                } else {
                    Log.w(TAG, "Could not sync clock with server, using local time")
                }

                // Start polling for state changes
                startPolling()

            } catch (e: Exception) {
                Log.e(TAG, "Clock sync error: ${e.message}")
                // Start polling anyway with zero offset
                startPolling()
            }
        }
    }

    /**
     * Poll server for state changes (start, stop, lap, reset).
     * This is NOT for timer ticks - timer is calculated locally.
     */
    private fun startPolling() {
        viewModelScope.launch {
            while (isActive) {
                try {
                    val raceState = repository.fetchRaceState()
                    if (raceState != null) {
                        // Check if state changed (not just time)
                        val stateChanged = currentRaceState?.isRunning != raceState.isRunning ||
                                currentRaceState?.startedAtMs != raceState.startedAtMs ||
                                currentRaceState?.lapTimes?.size != raceState.lapTimes.size

                        currentRaceState = raceState

                        if (stateChanged) {
                            Log.d(TAG, "State changed: isRunning=${raceState.isRunning}, startedAtMs=${raceState.startedAtMs}")
                            updateTimerJob()
                        }

                        // Update non-timer state
                        _uiState.value = _uiState.value.copy(
                            isRunning = raceState.isRunning,
                            totalRaceTime = raceState.totalRaceTime,
                            currentLap = raceState.lapTimes.size,
                            lapTimes = raceState.lapTimes,
                            isConnected = true,
                            isLoading = false
                        )

                        // Fetch flags once on first load
                        if (_uiState.value.flags.isEmpty()) {
                            fetchFlags()
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Polling error: ${e.message}")
                    _uiState.value = _uiState.value.copy(isConnected = false)
                }

                delay(POLL_INTERVAL_MS)
            }
        }
    }

    /**
     * Start or stop the local timer job based on race state.
     * The timer calculates elapsed time from server timestamp, not by counting.
     */
    private fun updateTimerJob() {
        timerJob?.cancel()

        val raceState = currentRaceState ?: return

        if (raceState.isRunning && raceState.startedAtMs != null) {
            // Start local timer loop
            timerJob = viewModelScope.launch {
                while (isActive) {
                    calculateAndUpdateTime(raceState)
                    delay(TIMER_UPDATE_INTERVAL_MS)
                }
            }
        } else {
            // Race not running - show 0 or last elapsed
            val timeLeft = raceState.totalRaceTime
            _uiState.value = _uiState.value.copy(
                timeLeftSeconds = timeLeft,
                currentLapElapsed = 0
            )
        }
    }

    /**
     * Calculate elapsed time using server timestamp.
     * Formula: elapsedMs = correctedNow - startedAtMs - pausedOffsetMs
     */
    private fun calculateAndUpdateTime(raceState: RaceState) {
        val startedAtMs = raceState.startedAtMs ?: return

        // Get server-corrected current time
        val correctedNow = System.currentTimeMillis() + clockOffset

        // Calculate elapsed time from server timestamp
        val elapsedMs = correctedNow - startedAtMs - raceState.pausedOffsetMs
        val elapsedSeconds = (elapsedMs / 1000).toInt().coerceAtLeast(0)

        // Calculate time left
        val timeLeft = (raceState.totalRaceTime - elapsedSeconds).coerceAtLeast(0)

        // Calculate current lap elapsed
        val previousLapsTotal = raceState.lapTimes.sum()
        val currentLapElapsed = (elapsedSeconds - previousLapsTotal).coerceAtLeast(0)

        _uiState.value = _uiState.value.copy(
            timeLeftSeconds = timeLeft,
            currentLapElapsed = currentLapElapsed
        )
    }

    private fun fetchFlags() {
        viewModelScope.launch {
            try {
                val flags = repository.fetchTrackFlags(_uiState.value.selectedTrack)
                _uiState.value = _uiState.value.copy(flags = flags)
            } catch (e: Exception) {
                Log.e(TAG, "Error fetching flags: ${e.message}")
            }
        }
    }

    // Called by LocationService
    fun updateGpsData(latitude: Double, longitude: Double, speed: Double) {
        _uiState.value = _uiState.value.copy(
            latitude = latitude,
            longitude = longitude,
            speed = speed
        )
    }

    // Change track
    fun selectTrack(trackId: String) {
        _uiState.value = _uiState.value.copy(selectedTrack = trackId)
        fetchFlags()
    }

    // Format time as MM:SS
    fun formatTime(seconds: Int): String {
        val mins = seconds / 60
        val secs = seconds % 60
        return "%02d:%02d".format(mins, secs)
    }

    // Get best lap
    fun getBestLapTime(): Int? {
        return _uiState.value.lapTimes.minOrNull()
    }

    override fun onCleared() {
        super.onCleared()
        timerJob?.cancel()
    }
}
