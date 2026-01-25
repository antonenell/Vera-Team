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
 * Server-Authoritative Timer with Sub-100ms Synchronization
 *
 * PRINCIPLE: "Send timestamps, not ticks. Calculate time, don't count it."
 *
 * Key synchronization techniques:
 * 1. High-resolution clock sync with RTT compensation
 * 2. Multiple sync attempts for accuracy (use lowest RTT)
 * 3. Resync on state changes
 * 4. All time computed in milliseconds, rounded only at display
 * 5. remainingMs recalculated on EVERY update, never stored/incremented
 *
 * Formula (computed every update):
 *   remainingMs = durationMs - (correctedNow - startedAtMs - pausedOffsetMs)
 *   where correctedNow = System.currentTimeMillis() + clockOffset
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
    @Volatile
    private var clockOffset: Long = 0L

    // Current race state from server (immutable reference)
    @Volatile
    private var currentRaceState: RaceState? = null

    // Timer job for local display updates
    private var timerJob: Job? = null

    // Polling job
    private var pollingJob: Job? = null

    // Flags polling job
    private var flagsPollingJob: Job? = null

    // GPS polling job
    private var gpsPollingJob: Job? = null

    companion object {
        private const val TAG = "DriverViewModel"
        private const val POLL_INTERVAL_MS = 3000L  // Poll server every 3 seconds for state changes
        private const val TIMER_UPDATE_INTERVAL_MS = 100L  // Update timer display every 100ms
        private const val CLOCK_SYNC_ATTEMPTS = 3
        private const val FLAGS_POLL_INTERVAL_MS = 1000L  // Poll flags every 1 second
        private const val GPS_POLL_INTERVAL_MS = 500L  // Poll GPS every 500ms
    }

    init {
        initialize()
    }

    /**
     * Initialize: sync clock first, then fetch state and start polling.
     */
    private fun initialize() {
        viewModelScope.launch {
            // Step 1: Sync clock (critical - must complete before using time)
            performClockSync()

            // Step 2: Fetch initial state
            val initialState = repository.fetchRaceState()
            if (initialState != null) {
                updateRaceState(initialState, isInitial = true)
            }

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                isConnected = initialState != null
            )

            // Step 3: Fetch flags
            fetchFlags()

            // Step 4: Second sync after short delay for improved accuracy
            delay(1000)
            performClockSync()

            // Step 5: Start polling
            startPolling()

            // Step 6: Start flags polling
            startFlagsPolling()

            // Step 7: Start GPS polling
            startGpsPolling()
        }
    }

    /**
     * Perform high-accuracy clock synchronization.
     * Makes multiple attempts and uses the one with lowest RTT.
     */
    private suspend fun performClockSync() {
        data class SyncResult(val offset: Long, val rtt: Long)

        val results = mutableListOf<SyncResult>()

        for (i in 0 until CLOCK_SYNC_ATTEMPTS) {
            try {
                val localBefore = System.currentTimeMillis()
                val serverTimeMs = repository.fetchServerTimeMs()
                val localAfter = System.currentTimeMillis()

                if (serverTimeMs != null) {
                    val rtt = localAfter - localBefore
                    val localMidpoint = localBefore + rtt / 2
                    val offset = serverTimeMs - localMidpoint
                    results.add(SyncResult(offset, rtt))
                }

                // Small delay between attempts
                if (i < CLOCK_SYNC_ATTEMPTS - 1) {
                    delay(50)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Clock sync attempt $i failed: ${e.message}")
            }
        }

        if (results.isNotEmpty()) {
            // Use measurement with lowest RTT (most accurate)
            val best = results.minByOrNull { it.rtt }!!
            clockOffset = best.offset
            Log.i(TAG, "Clock synced: offset=${best.offset}ms, RTT=${best.rtt}ms (${results.size} samples)")
        } else {
            Log.w(TAG, "Clock sync failed, using local time (offset=0)")
        }
    }

    /**
     * Update race state from server.
     * Completely replaces local state - no deltas preserved.
     */
    private fun updateRaceState(newState: RaceState, isInitial: Boolean = false) {
        val previousState = currentRaceState
        currentRaceState = newState

        // Check if this is a significant state change
        val stateChanged = previousState?.isRunning != newState.isRunning ||
                previousState?.startedAtMs != newState.startedAtMs

        // Update non-timer UI state
        _uiState.value = _uiState.value.copy(
            isRunning = newState.isRunning,
            totalRaceTime = newState.totalRaceTime,
            currentLap = newState.lapTimes.size,
            lapTimes = newState.lapTimes,
            isConnected = true
        )

        // Manage timer job based on state
        if (stateChanged || isInitial) {
            Log.d(TAG, "State changed: isRunning=${newState.isRunning}, startedAtMs=${newState.startedAtMs}")
            updateTimerJob(newState)

            // Resync clock on significant state changes
            if (stateChanged && !isInitial) {
                viewModelScope.launch {
                    performClockSync()
                }
            }
        }
    }

    /**
     * Poll server for state changes.
     * NOT for timer ticks - timer is calculated locally from timestamps.
     */
    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (isActive) {
                try {
                    val raceState = repository.fetchRaceState()
                    if (raceState != null) {
                        updateRaceState(raceState)
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
     * Timer recalculates from timestamps on every update - never increments.
     */
    private fun updateTimerJob(raceState: RaceState) {
        timerJob?.cancel()

        if (raceState.isRunning && raceState.startedAtMs != null) {
            // Start local timer loop - recalculates every 100ms
            timerJob = viewModelScope.launch {
                while (isActive) {
                    calculateAndUpdateTime()
                    delay(TIMER_UPDATE_INTERVAL_MS)
                }
            }
        } else {
            // Race not running - show full time
            _uiState.value = _uiState.value.copy(
                timeLeftSeconds = raceState.totalRaceTime,
                currentLapElapsed = 0
            )
        }
    }

    /**
     * Calculate time using the authoritative formula.
     * Called every 100ms - always recalculates from timestamps, never increments.
     *
     * Formula: remainingMs = durationMs - (correctedNow - startedAtMs - pausedOffsetMs)
     */
    private fun calculateAndUpdateTime() {
        val raceState = currentRaceState ?: return
        val startedAtMs = raceState.startedAtMs ?: return

        // Get server-corrected current time
        val correctedNow = System.currentTimeMillis() + clockOffset

        // Calculate elapsed time from server timestamp (in milliseconds)
        val elapsedMs = correctedNow - startedAtMs - raceState.pausedOffsetMs

        // Calculate remaining time (in milliseconds)
        val totalRaceTimeMs = raceState.totalRaceTime * 1000L
        val remainingMs = totalRaceTimeMs - elapsedMs

        // Round to seconds only at display time
        val timeLeftSeconds = (remainingMs / 1000).toInt().coerceAtLeast(0)
        val elapsedSeconds = (elapsedMs / 1000).toInt().coerceAtLeast(0)

        // Calculate current lap elapsed
        val previousLapsTotal = raceState.lapTimes.sum()
        val currentLapElapsed = (elapsedSeconds - previousLapsTotal).coerceAtLeast(0)

        _uiState.value = _uiState.value.copy(
            timeLeftSeconds = timeLeftSeconds,
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

    /**
     * Poll flags continuously for real-time updates from web app.
     */
    private fun startFlagsPolling() {
        flagsPollingJob?.cancel()
        flagsPollingJob = viewModelScope.launch {
            while (isActive) {
                try {
                    val flags = repository.fetchTrackFlags(_uiState.value.selectedTrack)
                    _uiState.value = _uiState.value.copy(flags = flags)
                } catch (e: Exception) {
                    Log.e(TAG, "Flags polling error: ${e.message}")
                }
                delay(FLAGS_POLL_INTERVAL_MS)
            }
        }
    }

    /**
     * Poll GPS telemetry from Supabase for real-time location updates.
     */
    private fun startGpsPolling() {
        gpsPollingJob?.cancel()
        gpsPollingJob = viewModelScope.launch {
            while (isActive) {
                try {
                    val telemetry = repository.fetchGpsTelemetry()
                    if (telemetry != null) {
                        _uiState.value = _uiState.value.copy(
                            latitude = telemetry.latitude,
                            longitude = telemetry.longitude,
                            speed = telemetry.speed
                        )
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "GPS polling error: ${e.message}")
                }
                delay(GPS_POLL_INTERVAL_MS)
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
        pollingJob?.cancel()
        flagsPollingJob?.cancel()
        gpsPollingJob?.cancel()
    }
}
