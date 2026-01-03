package com.verateam.driverdisplay

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.verateam.driverdisplay.data.RaceState
import com.verateam.driverdisplay.data.Repository
import com.verateam.driverdisplay.data.TrackFlag
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

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

    companion object {
        private const val TAG = "DriverViewModel"
    }

    init {
        startPolling()
    }

    // Simple polling - fetch from database every second
    private fun startPolling() {
        viewModelScope.launch {
            while (true) {
                try {
                    val raceState = repository.fetchRaceState()
                    if (raceState != null) {
                        updateFromRaceState(raceState)

                        // Mark as connected on first successful fetch
                        if (_uiState.value.isLoading) {
                            _uiState.value = _uiState.value.copy(
                                isLoading = false,
                                isConnected = true
                            )
                            // Also fetch flags once
                            fetchFlags()
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Polling error: ${e.message}")
                    _uiState.value = _uiState.value.copy(isConnected = false)
                }

                delay(1000) // Poll every 1 second
            }
        }
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

    private fun updateFromRaceState(raceState: RaceState) {
        val elapsedSeconds = raceState.elapsedSeconds
        val timeLeft = maxOf(0, raceState.totalRaceTime - elapsedSeconds)
        val previousLapsTotal = raceState.lapTimes.sum()
        val currentLapElapsed = maxOf(0, elapsedSeconds - previousLapsTotal)

        Log.d(TAG, "Update: isRunning=${raceState.isRunning}, timeLeft=$timeLeft, elapsed=$elapsedSeconds")

        _uiState.value = _uiState.value.copy(
            isRunning = raceState.isRunning,
            timeLeftSeconds = timeLeft,
            totalRaceTime = raceState.totalRaceTime,
            currentLap = raceState.lapTimes.size,
            lapTimes = raceState.lapTimes,
            currentLapElapsed = currentLapElapsed,
            isConnected = true
        )
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
}
