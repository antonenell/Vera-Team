package com.verateam.driverdisplay.voice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.verateam.driverdisplay.MainActivity
import com.verateam.driverdisplay.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Foreground service that owns the LiveKit voice-chat connection so the mic
 * keeps working when the app is backgrounded (Android 14+ requires the
 * "microphone" foreground service type for that).
 *
 * Lifecycle is driven by the bound client (VoiceViewModel): bind, call
 * connect(), later setMuted() / disconnect(). The service kills itself when
 * the controller disconnects.
 */
class VoiceService : Service() {

    companion object {
        private const val TAG = "VoiceService"
        private const val CHANNEL_ID = "voice_chat_channel"
        private const val NOTIFICATION_ID = 2
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private lateinit var controller: VoiceController

    private val binder = LocalBinder()
    inner class LocalBinder : Binder() {
        fun controller(): VoiceController = controller
        fun state(): StateFlow<VoiceController.VoiceState> = controller.state
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "onCreate")
        controller = VoiceController(applicationContext, scope)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand")
        startForeground(NOTIFICATION_ID, buildNotification())
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        Log.d(TAG, "onDestroy")
        controller.disconnect()
        scope.cancel()
        super.onDestroy()
    }

    /** Convenience wrappers so binders can call without juggling coroutines. */
    fun connectAsync(url: String, token: String) {
        scope.launch { controller.connect(url, token) }
    }

    fun setMutedAsync(muted: Boolean) {
        scope.launch { controller.setMuted(muted) }
    }

    fun disconnectAndStop() {
        controller.disconnect()
        stopSelf()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Voice Chat",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Microphone active for team voice chat"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Vera Team Voice")
            .setContentText("Voice chat active")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }
}
