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
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.verateam.driverdisplay.MainActivity
import com.verateam.driverdisplay.R
import com.verateam.driverdisplay.data.Repository
import com.verateam.driverdisplay.location.KalmanLatLong
import com.verateam.driverdisplay.location.LiveLocation
import com.verateam.driverdisplay.location.SpeedEstimator
import kotlinx.coroutines.*
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * High-accuracy, low-latency speed/location service.
 *
 * Speed pipeline (see SpeedEstimator):
 *  - Raw GNSS Doppler speed from LocationManager.GPS_PROVIDER (Location.getSpeed(),
 *    gated by hasSpeed() + speedAccuracy) is the accurate ABSOLUTE source — even
 *    at walking pace. Raw GPS_PROVIDER is used instead of the fused provider so
 *    every value is the chip's true per-fix Doppler velocity, not a fused
 *    "smoothed and processed" estimate (which adds latency).
 *  - The IMU (linear-accel projected on travel direction) only predicts BETWEEN
 *    the ~1 Hz fixes, at ~50 Hz, for responsiveness. A Kalman bias-state + ZUPT
 *    stop the low-speed drift that broke the earlier fusion.
 *  - ZUPT fires as soon as the IMU is quiet AND either GNSS or the Kalman speed
 *    is near zero — so a stop snaps to 0 within ~0.35 s, not a full GNSS cycle.
 *  - An uncertainty-scaled dead-band + a light, speed-adaptive display EMA give a
 *    stable 0 at rest and a fast-tracking readout.
 *
 * Output goes straight to [LiveLocation] (on-device, instant) for the driver's
 * own display, and is throttled to Supabase for the remote web dashboard.
 */
class LocationService : Service(), SensorEventListener {

    private lateinit var locationManager: LocationManager
    private lateinit var sensorManager: SensorManager
    private var wakeLock: PowerManager.WakeLock? = null

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val repository = Repository()

    private val kalmanFilter = KalmanLatLong()
    private val estimator = SpeedEstimator()

    private val locationListener = object : LocationListener {
        override fun onLocationChanged(location: Location) = processLocation(location)
        override fun onProviderEnabled(provider: String) {
            // GPS re-enabled / recovered — re-arm cleanly.
            restartLocationUpdates()
        }
        override fun onProviderDisabled(provider: String) {
            Log.w(TAG, "GPS provider disabled")
        }
    }

    // Sensors for IMU prediction + standstill detection.
    private var linearAccel: Sensor? = null
    private var rotationVector: Sensor? = null
    private var gyroscope: Sensor? = null
    private val rotationMatrix = FloatArray(9)
    private var haveRotation = false
    private var gyroMagnitude = 0.0
    private var lastImuNanos = 0L

    // Standstill (SHOE-lite): IMU is "quiet" when linear-accel + gyro stay small.
    private var quietSinceNanos = 0L

    // Direction of travel from GNSS (only trusted while moving).
    private var travelBearingRad = 0.0
    private var haveBearing = false

    // Latest GNSS-derived position + speed gate (for ZUPT + output).
    @Volatile private var lastLat = 0.0
    @Volatile private var lastLng = 0.0
    @Volatile private var lastHeadingDeg = 0.0
    @Volatile private var lastAccuracyM = 0f
    @Volatile private var lastGnssSpeedMps = 0.0
    @Volatile private var lastGnssSAcc = DEFAULT_SACC
    @Volatile private var lastGnssSpeedNanos = 0L
    @Volatile private var hasFix = false
    @Volatile private var currentDisplayKmh = 0.0
    private var lastGnssNanos = 0L
    private var lastTelemetryNanos = 0L
    private var lastTempSentNanos = 0L

    // GPS health monitoring
    private var lastValidLocationTime = 0L

    companion object {
        private const val TAG = "LocationService"
        private const val CHANNEL_ID = "location_service_channel"
        private const val NOTIFICATION_ID = 1

        private const val MAX_ACCEPTABLE_ACCURACY = 50f       // horizontal radius (m)
        private const val GPS_TIMEOUT_MS = 5000L

        // Speed gating / fusion
        private const val DEFAULT_SACC = 0.5                  // speed-accuracy fallback (m/s)
        private const val DEADBAND_K = 2.0                    // standstill: v < k·speedAccuracy
        private const val BEARING_MIN_SPEED = 2.0             // m/s — below this bearing is unreliable
        private const val STALE_FIX_NS = 3_000_000_000L       // reject fixes older than 3 s
        private const val ZUPT_KF_SPEED_MPS = 0.6             // KF-speed gate (only used during a GNSS dropout)
        private const val GNSS_SPEED_FRESH_NS = 2_500_000_000L // trust GNSS speed for ZUPT if < 2.5 s old

        // Standstill detection (faster than a full GNSS cycle)
        private const val ACCEL_QUIET = 0.35                  // m/s² (linear accel magnitude)
        private const val GYRO_QUIET = 0.08                   // rad/s
        private const val QUIET_DURATION_NS = 350_000_000L    // 0.35 s quiet ⇒ stationary

        private const val TELEMETRY_INTERVAL_NS = 200_000_000L // throttle Supabase to ~5 Hz
        private const val TEMP_INTERVAL_NS = 5_000_000_000L    // phone temp changes slowly: ~0.2 Hz
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        setupSensorManager()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        startLocationUpdates()
        startSensorUpdates()
        serviceScope.launch { repository.setOnlineStatus(true) }
        startGpsHealthMonitor()
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        stopLocationUpdates()
        stopSensorUpdates()
        releaseWakeLock()
        LiveLocation.update(LiveLocation.Data()) // clear
        runBlocking { repository.setOnlineStatus(false) }
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ========== NOTIFICATION ==========

    private fun createNotificationChannel() {
        val channel = NotificationChannel(CHANNEL_ID, "GPS Tracking", NotificationManager.IMPORTANCE_LOW).apply {
            description = "High-accuracy GPS tracking for racing"
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
            .setContentText("High-accuracy tracking enabled")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    // ========== LOCATION (raw GNSS) ==========

    private fun processLocation(location: Location) {
        // Reject stale or low-accuracy fixes before they reach the filter.
        val ageNs = SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos
        if (ageNs > STALE_FIX_NS) return
        if (location.accuracy > MAX_ACCEPTABLE_ACCURACY || location.accuracy <= 0) return

        lastValidLocationTime = System.currentTimeMillis()

        // Position: Kalman-smoothed lat/lng.
        val filtered = kalmanFilter.filter(location) ?: location
        lastLat = filtered.latitude
        lastLng = filtered.longitude
        lastAccuracyM = filtered.accuracy
        hasFix = true

        // Speed: GNSS Doppler correction (gated). Only correct when the provider
        // actually supplied a speed — never invent one from position deltas.
        if (location.hasSpeed()) {
            val sAcc = if (location.hasSpeedAccuracy() && location.speedAccuracyMetersPerSecond > 0f)
                location.speedAccuracyMetersPerSecond.toDouble() else DEFAULT_SACC
            lastGnssSpeedMps = location.speed.toDouble()
            lastGnssSAcc = sAcc
            lastGnssSpeedNanos = SystemClock.elapsedRealtimeNanos()
            estimator.correctGnss(location.speed.toDouble(), sAcc)
            // A clearly-moving fix breaks any accumulated "quiet" so ZUPT can't latch.
            if (lastGnssSpeedMps >= DEADBAND_K * lastGnssSAcc) quietSinceNanos = 0L
        }

        // Heading only when fast enough to be reliable; freeze it otherwise.
        if (location.hasBearing() && location.speed > BEARING_MIN_SPEED) {
            travelBearingRad = Math.toRadians(location.bearing.toDouble())
            haveBearing = true
            lastHeadingDeg = location.bearing.toDouble()
        }

        // If there is no IMU loop to drive output, publish from here.
        if (linearAccel == null) {
            val now = SystemClock.elapsedRealtimeNanos()
            val dt = if (lastGnssNanos == 0L) 0.0 else (now - lastGnssNanos) / 1e9
            lastGnssNanos = now
            currentDisplayKmh = estimator.displaySpeedKmh(dt)
            publish()
            maybeSendTelemetry()
        }
    }

    private fun startLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.e(TAG, "Location permission not granted")
            return
        }
        if (!locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            Log.w(TAG, "GPS provider disabled — speed will be unavailable until enabled")
        }
        try {
            // minTime=0, minDistance=0: deliver every GNSS fix (a non-zero distance
            // filter freezes the readout when crawling). The chip caps at ~1 Hz.
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER, 0L, 0f, locationListener, Looper.getMainLooper()
            )
            // Seed the watchdog clock so a first fix that never arrives still times
            // out and triggers a restart (cold start in a covered garage, etc.).
            if (lastValidLocationTime == 0L) lastValidLocationTime = System.currentTimeMillis()
            // Quick first value from the last known GNSS fix.
            locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)?.let {
                if (it.accuracy in 0.01f..MAX_ACCEPTABLE_ACCURACY) processLocation(it)
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Location permission revoked: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start location updates: ${e.message}")
        }
    }

    private fun stopLocationUpdates() {
        try {
            locationManager.removeUpdates(locationListener)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping location updates: ${e.message}")
        }
    }

    private fun restartLocationUpdates() {
        stopLocationUpdates() // removeUpdates() is thread-safe
        serviceScope.launch {
            // The estimator/Kalman/bearing state is owned by the main thread (the
            // sensor + location callbacks run there). Reset it on the main thread
            // so it never races the ~50 Hz sensor loop.
            withContext(Dispatchers.Main) {
                kalmanFilter.reset()
                estimator.reset()
                haveBearing = false
                travelBearingRad = 0.0
                lastGnssSpeedMps = 0.0
                lastGnssSAcc = DEFAULT_SACC
                lastGnssSpeedNanos = 0L
            }
            delay(500)
            withContext(Dispatchers.Main) { startLocationUpdates() }
        }
    }

    // ========== IMU FUSION (predict between fixes) + ZUPT ==========

    private fun setupSensorManager() {
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        linearAccel = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
        rotationVector = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
        logSensorInventory()
    }

    /** One-time capability check — logs every sensor and the environmental ones we
     *  might use for a real cabin temperature. Filter logcat by tag "SensorCheck". */
    private fun logSensorInventory() {
        val all = sensorManager.getSensorList(Sensor.TYPE_ALL)
        Log.i("SensorCheck", "===== ${all.size} sensors on this device =====")
        all.forEach { Log.i("SensorCheck", "type=${it.type} ${it.stringType}  '${it.name}'  vendor=${it.vendor}") }
        fun present(t: Int) = if (sensorManager.getDefaultSensor(t) != null) "YES" else "no"
        Log.i("SensorCheck", "Ambient temperature: ${present(Sensor.TYPE_AMBIENT_TEMPERATURE)}")
        Log.i("SensorCheck", "Relative humidity:   ${present(Sensor.TYPE_RELATIVE_HUMIDITY)}")
        Log.i("SensorCheck", "Pressure (barometer): ${present(Sensor.TYPE_PRESSURE)}")
        Log.i("SensorCheck", "Light:               ${present(Sensor.TYPE_LIGHT)}")
    }

    private fun startSensorUpdates() {
        rotationVector?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        gyroscope?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        linearAccel?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    private fun stopSensorUpdates() {
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        event ?: return
        when (event.sensor.type) {
            Sensor.TYPE_ROTATION_VECTOR -> {
                SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
                haveRotation = true
            }
            Sensor.TYPE_GYROSCOPE -> {
                gyroMagnitude = sqrt(
                    event.values[0] * event.values[0] +
                    event.values[1] * event.values[1] +
                    event.values[2] * event.values[2]
                ).toDouble()
            }
            Sensor.TYPE_LINEAR_ACCELERATION -> onLinearAcceleration(event)
        }
    }

    private fun onLinearAcceleration(event: SensorEvent) {
        val dt = if (lastImuNanos == 0L) 0.0 else (event.timestamp - lastImuNanos) / 1e9
        lastImuNanos = event.timestamp

        val ax = event.values[0]; val ay = event.values[1]; val az = event.values[2]
        val accelMag = sqrt(ax * ax + ay * ay + az * az).toDouble()

        // Longitudinal accel: rotate device→world (ENU), project on travel bearing.
        val aLon = if (haveRotation && haveBearing) {
            val east = rotationMatrix[0] * ax + rotationMatrix[1] * ay + rotationMatrix[2] * az
            val north = rotationMatrix[3] * ax + rotationMatrix[4] * ay + rotationMatrix[5] * az
            east * sin(travelBearingRad) + north * cos(travelBearingRad)
        } else 0.0

        estimator.predict(aLon, dt)

        // Standstill: IMU quiet for a short window AND (GNSS near zero OR the
        // Kalman speed is already near zero — which the IMU brings down within
        // ~20 ms of braking, so we don't wait a full GNSS cycle).
        val quiet = accelMag < ACCEL_QUIET && gyroMagnitude < GYRO_QUIET
        val now = event.timestamp
        if (quiet) {
            if (quietSinceNanos == 0L) quietSinceNanos = now
        } else {
            quietSinceNanos = 0L
        }
        val imuStationary = quietSinceNanos != 0L && (now - quietSinceNanos) > QUIET_DURATION_NS
        val gnssAgeNs = SystemClock.elapsedRealtimeNanos() - lastGnssSpeedNanos
        if (SpeedEstimator.shouldZupt(
                imuStationary = imuStationary,
                hadGnssSpeed = lastGnssSpeedNanos != 0L,
                gnssFresh = lastGnssSpeedNanos != 0L && gnssAgeNs < GNSS_SPEED_FRESH_NS,
                gnssNearZero = lastGnssSpeedMps < DEADBAND_K * lastGnssSAcc,
                hasGyro = gyroscope != null,
                kfSpeedNearZero = estimator.speedMps() < ZUPT_KF_SPEED_MPS,
            )
        ) {
            estimator.applyZupt()
        }

        currentDisplayKmh = estimator.displaySpeedKmh(dt)
        publish()
        maybeSendTelemetry()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ========== OUTPUT ==========

    private fun publish() {
        LiveLocation.update(
            LiveLocation.Data(
                latitude = lastLat,
                longitude = lastLng,
                speedKmh = currentDisplayKmh,
                headingDeg = lastHeadingDeg,
                accuracyM = lastAccuracyM,
                hasFix = hasFix,
                updatedAtMs = System.currentTimeMillis()
            )
        )
    }

    private fun maybeSendTelemetry() {
        if (!hasFix) return
        val now = SystemClock.elapsedRealtimeNanos()

        // Main telemetry (position / speed / battery %) at ~5 Hz.
        if (now - lastTelemetryNanos >= TELEMETRY_INTERVAL_NS) {
            lastTelemetryNanos = now
            val lat = lastLat; val lng = lastLng; val spd = currentDisplayKmh
            val hdg = lastHeadingDeg; val acc = lastAccuracyM.toDouble()
            serviceScope.launch {
                repository.updateGpsTelemetry(
                    latitude = lat, longitude = lng, speed = spd, heading = hdg,
                    accuracy = acc, batteryLevel = getBatteryLevel(),
                    signalStrength = getSignalStrength(), isOnline = true
                )
            }
        }

        // Phone battery temperature: separate, slow, resilient (a missing
        // battery_temp column can't break the main telemetry above).
        if (now - lastTempSentNanos >= TEMP_INTERVAL_NS) {
            lastTempSentNanos = now
            val tempC = getBatteryTemp()
            if (!tempC.isNaN()) {
                Log.i("SensorCheck", "Battery temp = $tempC °C (sending to Supabase)")
                serviceScope.launch { repository.updatePhoneTemp(tempC) }
            } else {
                Log.w("SensorCheck", "Battery temperature not available via EXTRA_TEMPERATURE on this device")
            }
        }
    }

    // ========== GPS HEALTH ==========

    private fun startGpsHealthMonitor() {
        serviceScope.launch {
            while (isActive) {
                delay(GPS_TIMEOUT_MS)
                val since = System.currentTimeMillis() - lastValidLocationTime
                if (lastValidLocationTime > 0 && since > GPS_TIMEOUT_MS * 2) {
                    restartLocationUpdates()
                }
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
        return if (tenths != Int.MIN_VALUE) tenths / 10.0 else Double.NaN
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
