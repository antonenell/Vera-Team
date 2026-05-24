package com.verateam.driverdisplay.voice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.verateam.driverdisplay.MainActivity
import com.verateam.driverdisplay.R

/**
 * Thin foreground service whose only job is to keep the microphone alive while
 * the app is backgrounded (Android 14+ requires foregroundServiceType=microphone
 * for that). The actual LiveKit Room is owned by VoiceViewModel.
 *
 * The viewmodel calls startForegroundService(...) when joining a voice session
 * and stopService(...) when leaving.
 */
class VoiceService : Service() {

    companion object {
        private const val CHANNEL_ID = "voice_chat_channel"
        private const val NOTIFICATION_ID = 2
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

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
