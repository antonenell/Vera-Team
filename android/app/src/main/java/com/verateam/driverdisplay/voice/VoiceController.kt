package com.verateam.driverdisplay.voice

import android.content.Context
import android.util.Log
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Owns a single LiveKit Room. State flow drives the UI.
 */
class VoiceController(
    private val appContext: Context,
    private val scope: CoroutineScope,
) {
    companion object {
        private const val TAG = "VoiceController"
    }

    sealed interface VoiceState {
        data object Idle : VoiceState
        data object Connecting : VoiceState
        data object Reconnecting : VoiceState
        data class Connected(val isMuted: Boolean) : VoiceState
        data class Error(val message: String) : VoiceState
    }

    private val _state = MutableStateFlow<VoiceState>(VoiceState.Idle)
    val state: StateFlow<VoiceState> = _state.asStateFlow()

    private var room: Room? = null
    private var eventJob: Job? = null

    suspend fun connect(url: String, token: String) {
        val current = _state.value
        if (current is VoiceState.Connecting || current is VoiceState.Connected) return

        _state.value = VoiceState.Connecting
        val r = LiveKit.create(appContext)
        room = r

        eventJob?.cancel()
        eventJob = scope.launch {
            r.events.collect { event ->
                when (event) {
                    is RoomEvent.Reconnecting -> _state.value = VoiceState.Reconnecting
                    is RoomEvent.Reconnected -> {
                        val prev = (_state.value as? VoiceState.Connected)?.isMuted ?: true
                        _state.value = VoiceState.Connected(isMuted = prev)
                    }
                    is RoomEvent.Disconnected -> _state.value = VoiceState.Idle
                    else -> { /* not relevant for state */ }
                }
            }
        }

        try {
            r.connect(url.trim(), token.trim())
            r.localParticipant.setMicrophoneEnabled(false)
            _state.value = VoiceState.Connected(isMuted = true)
            Log.d(TAG, "Connected to LiveKit room")
        } catch (e: Exception) {
            Log.e(TAG, "Connect failed: ${e.message}", e)
            cleanup()
            _state.value = VoiceState.Error(e.message ?: "Connection failed")
        }
    }

    suspend fun setMuted(muted: Boolean) {
        val r = room ?: return
        try {
            r.localParticipant.setMicrophoneEnabled(!muted)
            val curr = _state.value
            if (curr is VoiceState.Connected) {
                _state.value = curr.copy(isMuted = muted)
            }
        } catch (e: Exception) {
            Log.e(TAG, "setMuted failed: ${e.message}", e)
            _state.value = VoiceState.Error(e.message ?: "Mute failed")
        }
    }

    fun disconnect() {
        try {
            room?.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "disconnect failed: ${e.message}", e)
        } finally {
            cleanup()
            _state.value = VoiceState.Idle
        }
    }

    /** Surface an error from outside (e.g. token fetch failure). */
    fun setError(message: String) {
        cleanup()
        _state.value = VoiceState.Error(message)
    }

    private fun cleanup() {
        eventJob?.cancel()
        eventJob = null
        room?.release()
        room = null
    }
}
