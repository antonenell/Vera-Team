package com.verateam.driverdisplay

import android.app.Application
import android.content.Context
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.verateam.driverdisplay.data.MeanSpeedTarget
import com.verateam.driverdisplay.data.PaceCalculator
import com.verateam.driverdisplay.data.RaceState
import com.verateam.driverdisplay.data.Repository
import com.verateam.driverdisplay.data.TrackFlag
import com.verateam.driverdisplay.location.LiveLocation
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
    val safetySeconds: Int = 60,
    val currentLap: Int = 0,
    val totalLaps: Int = 11,
    val lapTimes: List<Int> = emptyList(),
    val currentLapElapsed: Int = 0,

    // GPS data
    val speed: Double = 0.0,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,

    // Pacing: target mean speed to make the race plan
    val meanSpeedTarget: MeanSpeedTarget = MeanSpeedTarget(),

    // Flags
    val flags: List<TrackFlag> = emptyList(),
    val selectedTrack: String = "stora-holm"
)

class DriverViewModel(app: Application) : AndroidViewModel(app) {

    private val repository = Repository()

    // Persists the race odometer (keyed by startedAtMs) so an app restart mid-race
    // doesn't lose the calibrated lap distance / actual average.
    private val pacePrefs = app.getSharedPreferences("vera_pace", Context.MODE_PRIVATE)
    private var odoRestoreChecked = false
    private var lastPersistMs = 0L

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

    // Odometer (∫ GPS speed dt) for self-calibrating lap distance + actual mean speed.
    @Volatile private var odometerMeters = 0.0
    private var odometerAtLastLap = 0.0
    private var lastOdoUpdateMs = 0L

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

            // Step 7: Reflect on-device live location instantly (no Supabase poll)
            observeLiveLocation()
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

        val prevLaps = previousState?.lapTimes?.size ?: 0
        val startedAtMs = newState.startedAtMs

        // Odometer lifecycle.
        when {
            startedAtMs == null -> {
                // Idle / reset → clear everything (in memory + persisted).
                odometerMeters = 0.0; odometerAtLastLap = 0.0; lastOdoUpdateMs = 0L
                pacePrefs.edit().clear().apply()
            }
            previousState != null && previousState.startedAtMs != startedAtMs -> {
                // Genuine new race → fresh odometer.
                odometerMeters = 0.0; odometerAtLastLap = 0.0; lastOdoUpdateMs = 0L
            }
            previousState == null -> {
                // First observation of an already-running race (e.g. app restarted
                // mid-race) → restore the odometer instead of zeroing it.
                maybeRestoreOdometer(startedAtMs)
            }
        }

        // A genuine new lap (not the first observed state) → snapshot the odometer,
        // back-dated to the actual line crossing to undo the poll lag.
        if (previousState != null && newState.lapTimes.size > prevLaps) {
            odometerAtLastLap = backDatedLapOdometer(newState)
            persistOdometer()
        }

        // Check if this is a significant state change
        val stateChanged = previousState?.isRunning != newState.isRunning ||
                previousState?.startedAtMs != newState.startedAtMs

        // Update non-timer UI state
        _uiState.value = _uiState.value.copy(
            isRunning = newState.isRunning,
            totalRaceTime = newState.totalRaceTime,
            safetySeconds = newState.safetySeconds,
            totalLaps = newState.totalLaps,
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
            // Running: keep the local timer loop ticking
            timerJob = viewModelScope.launch {
                while (isActive) {
                    calculateAndUpdateTime()
                    delay(TIMER_UPDATE_INTERVAL_MS)
                }
            }
        } else if (raceState.startedAtMs != null) {
            // Paused: render the frozen time once, no loop
            calculateAndUpdateTime()
        } else {
            // Idle (never started or reset): show full time, clear the pace panel
            _uiState.value = _uiState.value.copy(
                timeLeftSeconds = raceState.totalRaceTime,
                currentLapElapsed = 0,
                meanSpeedTarget = MeanSpeedTarget()
            )
        }
    }

    /**
     * Calculate time using the authoritative formula.
     * Called every 100ms - always recalculates from timestamps, never increments.
     *
     * Formula: remainingMs = durationMs - (referenceNow - startedAtMs - pausedOffsetMs)
     * referenceNow = correctedNow while running; pausedAtMs while paused.
     */
    private fun calculateAndUpdateTime() {
        val raceState = currentRaceState ?: return
        val startedAtMs = raceState.startedAtMs ?: return

        // While paused, freeze the reference at the pause timestamp so the timer doesn't tick down.
        val referenceNow = if (raceState.isRunning) {
            System.currentTimeMillis() + clockOffset
        } else {
            raceState.pausedAtMs ?: startedAtMs
        }

        // Calculate elapsed time from server timestamp (in milliseconds)
        val elapsedMs = referenceNow - startedAtMs - raceState.pausedOffsetMs

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
            currentLapElapsed = currentLapElapsed,
            meanSpeedTarget = computePace()
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
     * Reflect the on-device live location (produced by LocationService) directly
     * in the UI. This is local and instant — no Supabase round-trip — so the
     * driver's speedometer/map update the moment a GPS fix arrives.
     */
    private fun observeLiveLocation() {
        gpsPollingJob?.cancel()
        gpsPollingJob = viewModelScope.launch {
            LiveLocation.state.collect { loc ->
                integrateOdometer(loc.speedKmh)
                _uiState.value = _uiState.value.copy(
                    latitude = loc.latitude,
                    longitude = loc.longitude,
                    speed = loc.speedKmh,
                    meanSpeedTarget = computePace()
                )
            }
        }
    }

    /** Integrate GPS speed into the race odometer while the race is running. */
    private fun integrateOdometer(speedKmh: Double) {
        val now = System.currentTimeMillis()
        val running = currentRaceState?.let { it.isRunning && it.startedAtMs != null } == true
        if (running && lastOdoUpdateMs != 0L) {
            val dt = (now - lastOdoUpdateMs) / 1000.0
            if (dt in 0.0..2.0) odometerMeters += (speedKmh / 3.6) * dt
        }
        lastOdoUpdateMs = now
        if (running && now - lastPersistMs > 3000L) {
            lastPersistMs = now
            persistOdometer()
        }
    }

    /**
     * Back-date the lap-completion odometer to the real line-crossing time — the
     * 3 s race_state poll detects laps late, so subtract the distance driven since
     * the lap actually ended (using the current speed). Clamped not to go backwards.
     */
    private fun backDatedLapOdometer(state: RaceState): Double {
        val lapEndElapsed = state.lapTimes.sum().toDouble()
        val lagSec = (currentElapsedSeconds() - lapEndElapsed).coerceIn(0.0, 5.0)
        val curSpeedMps = _uiState.value.speed / 3.6
        return (odometerMeters - lagSec * curSpeedMps).coerceAtLeast(odometerAtLastLap)
    }

    private fun persistOdometer() {
        val started = currentRaceState?.startedAtMs ?: return
        pacePrefs.edit()
            .putLong("started", started)
            .putString("odo", odometerMeters.toString())
            .putString("odoLap", odometerAtLastLap.toString())
            .apply()
    }

    private fun maybeRestoreOdometer(startedAtMs: Long) {
        if (odoRestoreChecked) return
        odoRestoreChecked = true
        if (pacePrefs.getLong("started", 0L) == startedAtMs) {
            odometerMeters = pacePrefs.getString("odo", null)?.toDoubleOrNull() ?: 0.0
            odometerAtLastLap = pacePrefs.getString("odoLap", null)?.toDoubleOrNull() ?: 0.0
            lastOdoUpdateMs = 0L
        }
    }

    /** Target mean speed from the race plan + lap scores + GPS-measured distance. */
    private fun computePace(): MeanSpeedTarget {
        val rs = currentRaceState ?: return MeanSpeedTarget()
        val lapsCompleted = rs.lapTimes.size
        val lapDistance = if (lapsCompleted >= 1 && odometerAtLastLap > 0.0)
            odometerAtLastLap / lapsCompleted else 0.0
        return PaceCalculator.compute(
            totalLaps = rs.totalLaps,
            lapsCompleted = lapsCompleted,
            targetBudgetSec = (rs.totalRaceTime - rs.safetySeconds).toDouble(),
            elapsedSec = currentElapsedSeconds(),
            completedLapsSec = rs.lapTimes.sum().toDouble(),
            lapDistanceM = lapDistance,
            odometerM = odometerMeters,
        )
    }

    /** Live elapsed race time (seconds), same authoritative formula as the timer. */
    private fun currentElapsedSeconds(): Double {
        val rs = currentRaceState ?: return 0.0
        val startedAtMs = rs.startedAtMs ?: return 0.0
        val referenceNow = if (rs.isRunning) System.currentTimeMillis() + clockOffset
            else (rs.pausedAtMs ?: startedAtMs)
        val elapsedMs = referenceNow - startedAtMs - rs.pausedOffsetMs
        return (elapsedMs / 1000.0).coerceAtLeast(0.0)
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
