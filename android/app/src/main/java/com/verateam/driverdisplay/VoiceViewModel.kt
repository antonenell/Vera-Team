package com.verateam.driverdisplay

import android.app.Application
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.verateam.driverdisplay.voice.VoiceController
import com.verateam.driverdisplay.voice.VoiceRepository
import com.verateam.driverdisplay.voice.VoiceService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Drives the voice-chat UI on the driver tablet. Owns the VoiceController
 * directly; the VoiceService only exists to hold the foreground notification
 * so the mic keeps working when the app is backgrounded.
 */
class VoiceViewModel(application: Application) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "VoiceViewModel"
    }

    private val controller = VoiceController(application.applicationContext, viewModelScope)
    private val repository = VoiceRepository()

    val state: StateFlow<VoiceController.VoiceState> = controller.state

    private val _hasMicPermission = MutableStateFlow(false)
    val hasMicPermission: StateFlow<Boolean> = _hasMicPermission.asStateFlow()

    fun setMicPermissionGranted(granted: Boolean) {
        _hasMicPermission.value = granted
    }

    fun join() {
        if (!_hasMicPermission.value) {
            Log.w(TAG, "join() called without mic permission")
            controller.setError("Mikrofon-tillstånd saknas")
            return
        }
        startVoiceService()
        viewModelScope.launch {
            val token = repository.fetchToken()
            if (token == null) {
                controller.setError("Kunde inte hämta token")
                stopVoiceService()
                return@launch
            }
            controller.connect(token.url, token.token)
        }
    }

    fun toggleMute() {
        val curr = controller.state.value
        if (curr !is VoiceController.VoiceState.Connected) return
        viewModelScope.launch { controller.setMuted(!curr.isMuted) }
    }

    fun leave() {
        controller.disconnect()
        stopVoiceService()
    }

    private fun startVoiceService() {
        val ctx = getApplication<Application>()
        val intent = Intent(ctx, VoiceService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }
    }

    private fun stopVoiceService() {
        val ctx = getApplication<Application>()
        ctx.stopService(Intent(ctx, VoiceService::class.java))
    }

    override fun onCleared() {
        super.onCleared()
        controller.disconnect()
        stopVoiceService()
    }
}
