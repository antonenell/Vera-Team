package com.verateam.driverdisplay.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.verateam.driverdisplay.MainActivity
import com.verateam.driverdisplay.R
import com.verateam.driverdisplay.data.Repository
import com.verateam.driverdisplay.location.LiveLocation
import com.verateam.driverdisplay.location.SpeedSmoothing
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Simple, reliable speed/location service.
 *
 * Speed is the GNSS Doppler velocity straight from the fused provider
 * (Location.getSpeed(), derived from the carrier-phase Doppler shift). That is
 * accurate even at walking pace, so low speeds register honestly — there is no
 * Kalman/ZUPT/dead-band that could zero a slowly-moving car. A light EMA removes
 * single-sample flicker; a small floor shows a clean 0 only at true standstill.
 *
 * The exact value the driver sees on-device (via [LiveLocation]) is the value we
 * write to Supabase, so the app speedometer and the web "Speed" box always match.
 * Telemetry goes through one conflated writer so the row can never go backwards.
 */
class LocationService : Service() {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var wakeLock: PowerManager.WakeLock? = null

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val repository = Repository()
    private val started = AtomicBoolean(false)

    // Single smoothed speed (km/h) used for BOTH the on-device display and telemetry.
    // Touched only on the main thread (the fused-location callback runs there).
    private var displayKmh = 0.0
    private var haveFirstSpeed = false
    private var lastSpeedFixMs = 0L

    // One position/speed snapshot per fix; CONFLATED so a slow network drops stale
    // intermediate fixes and a single collector writes them strictly in order.
    private data class TelemetrySample(
        val lat: Double, val lng: Double, val speedKmh: Double,
        val headingDeg: Double, val accuracyM: Double,
    )
    private val telemetryChannel = Channel<TelemetrySample>(Channel.CONFLATED)

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { processLocation(it) }
        }
    }

    companion object {
        private const val TAG = "LocationService"
        private const val CHANNEL_ID = "location_service_channel"
        private const val NOTIFICATION_ID = 1

        private const val UPDATE_INTERVAL_MS = 200L   // request 5 Hz; the chip delivers as fast as it can
        private const val TEMP_INTERVAL_MS = 5000L    // phone temperature changes slowly
        private const val NO_SPEED_DECAY_MS = 1500L   // after this long without a speed fix, decay toward 0
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        // Start the one-time work exactly once per service instance — onStartCommand
        // can fire several times for a single launch (and on START_STICKY redelivery).
        if (started.compareAndSet(false, true)) {
            startTelemetrySender()
            startLocationUpdates()
            serviceScope.launch { repository.setOnlineStatus(true) }
            startPhoneTempReporter()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        stopLocationUpdates()
        releaseWakeLock()
        LiveLocation.update(LiveLocation.Data()) // clear the on-device readout
        // Best-effort offline flip, bounded so a slow/down network can't ANR teardown.
        try {
            runBlocking { withTimeout(2000) { repository.setOnlineStatus(false) } }
        } catch (e: Exception) {
            Log.w(TAG, "offline flip skipped: ${e.message}")
        }
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ========== NOTIFICATION ==========

    private fun createNotificationChannel() {
        val channel = NotificationChannel(CHANNEL_ID, "GPS Tracking", NotificationManager.IMPORTANCE_LOW).apply {
            description = "GPS tracking for racing"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Vera Team GPS Active")
            .setContentText("Tracking enabled")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    // ========== LOCATION → SPEED ==========

    private fun processLocation(location: Location) {
        // GNSS Doppler speed (m/s → km/h). Normally every fused fix carries a speed;
        // on the rare fix that doesn't, hold the last value briefly, then decay to 0
        // so a parked car can never latch a stale non-zero reading.
        val now = System.currentTimeMillis()
        val rawKmh: Double = when {
            location.hasSpeed() -> { lastSpeedFixMs = now; location.speed * 3.6 }
            lastSpeedFixMs != 0L && now - lastSpeedFixMs > NO_SPEED_DECAY_MS -> 0.0
            else -> displayKmh
        }
        displayKmh = SpeedSmoothing.smooth(displayKmh, rawKmh, haveFirstSpeed)
        haveFirstSpeed = true

        // On-device display (instant) — the driver's speedometer reads from here.
        LiveLocation.update(
            LiveLocation.Data(
                latitude = location.latitude,
                longitude = location.longitude,
                speedKmh = displayKmh,
                headingDeg = location.bearing.toDouble(),
                accuracyM = location.accuracy,
                hasFix = true,
                updatedAtMs = now
            )
        )

        // Remote telemetry (web dashboard) — the SAME value, conflated to one writer.
        telemetryChannel.trySend(
            TelemetrySample(
                lat = location.latitude, lng = location.longitude, speedKmh = displayKmh,
                headingDeg = location.bearing.toDouble(), accuracyM = location.accuracy.toDouble()
            )
        )
    }

    /** Single in-order writer for gps_telemetry — the row never regresses to an older fix. */
    private fun startTelemetrySender() {
        serviceScope.launch {
            for (s in telemetryChannel) {
                repository.updateGpsTelemetry(
                    latitude = s.lat, longitude = s.lng, speed = s.speedKmh, heading = s.headingDeg,
                    accuracy = s.accuracyM, batteryLevel = getBatteryLevel(),
                    signalStrength = getSignalStrength(), isOnline = true
                )
            }
        }
    }

    private fun startLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.e(TAG, "Location permission not granted")
            return
        }
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
            .setMinUpdateIntervalMillis(UPDATE_INTERVAL_MS)
            .setWaitForAccurateLocation(false)
            .build()
        try {
            fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        } catch (e: SecurityException) {
            Log.e(TAG, "Location permission revoked: ${e.message}")
        }
    }

    private fun stopLocationUpdates() {
        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping location updates: ${e.message}")
        }
    }

    // ========== PHONE TEMPERATURE (independent of GPS) ==========

    private fun startPhoneTempReporter() {
        serviceScope.launch {
            while (isActive) {
                val tempC = getBatteryTemp()
                if (!tempC.isNaN()) repository.updatePhoneTemp(tempC)
                delay(TEMP_INTERVAL_MS)
            }
        }
    }

    // ========== WAKELOCK ==========

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "VeraTeam::LocationWakeLock").apply {
            acquire(60 * 60 * 1000L)
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    // ========== UTILITIES ==========

    private fun getBatteryLevel(): Int {
        val batteryIntent = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100 / scale) else 100
    }

    /** Battery (≈ phone) temperature in °C — the only thermometer a normal app can read. */
    private fun getBatteryTemp(): Double {
        val batteryIntent = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val tenths = batteryIntent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE) ?: Int.MIN_VALUE
        if (tenths != Int.MIN_VALUE && tenths != 0) return tenths / 10.0
        // Some OnePlus/Oppo builds omit EXTRA_TEMPERATURE — fall back to sysfs.
        return readSysfsBatteryTemp()
    }

    private fun readSysfsBatteryTemp(): Double {
        val paths = listOf(
            "/sys/class/power_supply/battery/temp",
            "/sys/class/power_supply/bms/temp",
            "/sys/class/power_supply/battery/batt_temp"
        )
        for (p in paths) {
            try {
                val raw = java.io.File(p).readText().trim().toIntOrNull() ?: continue
                // Usually tenths of °C (e.g. 310 = 31.0°C); occasionally whole °C.
                val c = if (kotlin.math.abs(raw) >= 100) raw / 10.0 else raw.toDouble()
                if (c in -30.0..120.0) return c
            } catch (e: Exception) { /* missing or SELinux-denied — try next */ }
        }
        return Double.NaN
    }

    private fun getSignalStrength(): Int {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return 0
        val caps = cm.getNetworkCapabilities(network) ?: return 0
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> 100
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> 75
            else -> 50
        }
    }
}
