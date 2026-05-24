package com.verateam.driverdisplay

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.verateam.driverdisplay.voice.VoiceController
import com.verateam.driverdisplay.voice.VoiceRepository
import com.verateam.driverdisplay.voice.VoiceService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Drives the voice-chat UI on the driver tablet. Binds to VoiceService, kicks
 * off token fetch + connect, and forwards mute toggles. Disconnect tears down
 * the service entirely so the foreground notification disappears.
 */
class VoiceViewModel(application: Application) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "VoiceViewModel"
    }

    private val repository = VoiceRepository()

    private val _state = MutableStateFlow<VoiceController.VoiceState>(VoiceController.VoiceState.Idle)
    val state: StateFlow<VoiceController.VoiceState> = _state.asStateFlow()

    private val _hasMicPermission = MutableStateFlow(false)
    val hasMicPermission: StateFlow<Boolean> = _hasMicPermission.asStateFlow()

    private var service: VoiceService? = null
    private var stateCollectionJob: kotlinx.coroutines.Job? = null

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            val localBinder = binder as? VoiceService.LocalBinder ?: return
            // We can't easily reach the service instance through LocalBinder alone, so we
            // re-bind via the singleton convention: LocalBinder.controller().
            val controller = localBinder.controller()
            // Pipe controller state into our own state flow
            stateCollectionJob?.cancel()
            stateCollectionJob = viewModelScope.launch {
                controller.state.collect { st -> _state.value = st }
            }
            // Stash service reference via reflection-free approach: the binder also
            // exposes the service through its outer-class reference; we use the binder
            // as a proxy in the actions below.
            serviceBinder = localBinder
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            serviceBinder = null
            service = null
        }
    }

    private var serviceBinder: VoiceService.LocalBinder? = null

    fun setMicPermissionGranted(granted: Boolean) {
        _hasMicPermission.value = granted
    }

    fun join() {
        if (!_hasMicPermission.value) {
            Log.w(TAG, "join() called without mic permission")
            return
        }
        val ctx = getApplication<Application>()
        // Start + bind the service
        val intent = Intent(ctx, VoiceService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }
        ctx.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)

        // Fetch token and tell the (about-to-be-bound) service to connect
        viewModelScope.launch {
            val token = repository.fetchToken()
            if (token == null) {
                _state.value = VoiceController.VoiceState.Error("Kunde inte hämta token")
                return@launch
            }
            // The binder may not be ready yet — wait a tick and retry briefly
            var attempts = 0
            while (serviceBinder == null && attempts < 50) {
                kotlinx.coroutines.delay(20)
                attempts++
            }
            val binder = serviceBinder
            if (binder == null) {
                _state.value = VoiceController.VoiceState.Error("Service inte bunden")
                return@launch
            }
            // Reach the controller and connect
            binder.controller().connect(token.url, token.token)
        }
    }

    fun toggleMute() {
        val curr = _state.value
        if (curr !is VoiceController.VoiceState.Connected) return
        val controller = serviceBinder?.controller() ?: return
        viewModelScope.launch {
            controller.setMuted(!curr.isMuted)
        }
    }

    fun leave() {
        val ctx = getApplication<Application>()
        try {
            serviceBinder?.controller()?.disconnect()
        } catch (_: Exception) { /* ignore */ }
        try {
            ctx.unbindService(serviceConnection)
        } catch (_: IllegalArgumentException) { /* not bound */ }
        ctx.stopService(Intent(ctx, VoiceService::class.java))
        serviceBinder = null
        _state.value = VoiceController.VoiceState.Idle
    }

    override fun onCleared() {
        super.onCleared()
        val ctx = getApplication<Application>()
        try { ctx.unbindService(serviceConnection) } catch (_: IllegalArgumentException) {}
    }
}
