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
import com.google.android.gms.location.*
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
 *  - GNSS Doppler speed (Location.getSpeed(), gated by hasSpeed() + speedAccuracy)
 *    is the accurate ABSOLUTE source — even at walking pace.
 *  - The IMU (linear-accel projected on travel direction) only predicts BETWEEN
 *    the ~1 Hz fixes, at ~50 Hz, for responsiveness. A Kalman bias-state + ZUPT
 *    stop the low-speed drift that broke the earlier fusion.
 *  - An uncertainty-scaled dead-band (v < k·speedAccuracy ⇒ 0) replaces the old
 *    hard <0.3 m/s cut, and a speed-adaptive dt-aware EMA replaces the laggy EMA.
 *  - minUpdateDistance is 0 (a non-zero value froze the readout when crawling).
 *
 * Output goes straight to [LiveLocation] (on-device, instant) for the driver's
 * own display, and is throttled to Supabase for the remote web dashboard.
 */
class LocationService : Service(), SensorEventListener {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var sensorManager: SensorManager
    private var wakeLock: PowerManager.WakeLock? = null

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val repository = Repository()

    private val kalmanFilter = KalmanLatLong()
    private val estimator = SpeedEstimator()

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
    @Volatile private var hasFix = false
    @Volatile private var currentDisplayKmh = 0.0
    private var lastGnssNanos = 0L
    private var lastTelemetryNanos = 0L

    // GPS health monitoring
    private var consecutiveGpsFailures = 0
    private var lastValidLocationTime = 0L

    companion object {
        private const val TAG = "LocationService"
        private const val CHANNEL_ID = "location_service_channel"
        private const val NOTIFICATION_ID = 1

        private const val UPDATE_INTERVAL_MS = 1000L          // 1 Hz GNSS target (chip ceiling)
        private const val FASTEST_UPDATE_INTERVAL_MS = 0L     // pass every fix
        private const val MAX_ACCEPTABLE_ACCURACY = 50f       // horizontal radius (m)
        private const val GPS_TIMEOUT_MS = 5000L

        // Speed gating / fusion
        private const val DEFAULT_SACC = 0.5                  // speed-accuracy fallback (m/s)
        private const val DEADBAND_K = 2.0                    // standstill: v < k·speedAccuracy
        private const val BEARING_MIN_SPEED = 2.0             // m/s — below this bearing is unreliable
        private const val STALE_FIX_NS = 3_000_000_000L       // reject fixes older than 3 s

        // Standstill detection
        private const val ACCEL_QUIET = 0.35                  // m/s² (linear accel magnitude)
        private const val GYRO_QUIET = 0.08                   // rad/s
        private const val QUIET_DURATION_NS = 700_000_000L    // 0.7 s quiet ⇒ stationary

        private const val TELEMETRY_INTERVAL_NS = 200_000_000L // throttle Supabase to ~5 Hz
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        setupLocationCallback()
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

    // ========== LOCATION (GNSS) ==========

    private fun setupLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { processLocation(it) }
            }

            override fun onLocationAvailability(availability: LocationAvailability) {
                if (!availability.isLocationAvailable) {
                    consecutiveGpsFailures++
                    if (consecutiveGpsFailures > 3) restartLocationUpdates()
                } else {
                    consecutiveGpsFailures = 0
                }
            }
        }
    }

    private fun processLocation(location: Location) {
        // Reject stale or low-accuracy fixes before they reach the filter.
        val ageNs = SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos
        if (ageNs > STALE_FIX_NS) return
        if (location.accuracy > MAX_ACCEPTABLE_ACCURACY || location.accuracy <= 0) return

        lastValidLocationTime = System.currentTimeMillis()
        consecutiveGpsFailures = 0

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
            estimator.correctGnss(location.speed.toDouble(), sAcc)
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
        try {
            fusedLocationClient.requestLocationUpdates(
                createLocationRequest(), locationCallback, Looper.getMainLooper()
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start location updates: ${e.message}")
        }
        fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
            loc?.let { if (it.accuracy in 0.01f..MAX_ACCEPTABLE_ACCURACY) processLocation(it) }
        }
    }

    private fun createLocationRequest(): LocationRequest =
        LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
            .setMinUpdateIntervalMillis(FASTEST_UPDATE_INTERVAL_MS) // pass every fix
            .setMinUpdateDistanceMeters(0f)                          // CRITICAL: never throttle by distance
            .setWaitForAccurateLocation(false)
            .setGranularity(Granularity.GRANULARITY_FINE)
            .setMaxUpdateDelayMillis(0L)                             // no batching
            .build()

    private fun stopLocationUpdates() {
        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping location updates: ${e.message}")
        }
    }

    private fun restartLocationUpdates() {
        stopLocationUpdates()
        kalmanFilter.reset()
        estimator.reset()
        haveBearing = false
        serviceScope.launch {
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

        // Standstill detection: IMU quiet for a sustained window AND GNSS near zero.
        val quiet = accelMag < ACCEL_QUIET && gyroMagnitude < GYRO_QUIET
        val now = event.timestamp
        if (quiet) {
            if (quietSinceNanos == 0L) quietSinceNanos = now
        } else {
            quietSinceNanos = 0L
        }
        val imuStationary = quietSinceNanos != 0L && (now - quietSinceNanos) > QUIET_DURATION_NS
        val gnssNearZero = lastGnssSpeedMps < DEADBAND_K * lastGnssSAcc
        if (imuStationary && gnssNearZero) {
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
        val now = SystemClock.elapsedRealtimeNanos()
        if (now - lastTelemetryNanos < TELEMETRY_INTERVAL_NS) return
        lastTelemetryNanos = now
        if (!hasFix) return
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

    // ========== GPS HEALTH ==========

    private fun startGpsHealthMonitor() {
        serviceScope.launch {
            while (isActive) {
                delay(GPS_TIMEOUT_MS)
                val since = System.currentTimeMillis() - lastValidLocationTime
                if (lastValidLocationTime > 0 && since > GPS_TIMEOUT_MS * 2) restartLocationUpdates()
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
