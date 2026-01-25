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
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import com.verateam.driverdisplay.MainActivity
import com.verateam.driverdisplay.R
import com.verateam.driverdisplay.data.Repository
import com.verateam.driverdisplay.location.BearingSmoother
import com.verateam.driverdisplay.location.KalmanLatLong
import com.verateam.driverdisplay.location.SpeedSmoother
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Optimized Location Service for OnePlus Nord CE 3 Lite / OxygenOS 14
 *
 * Features:
 * - FusedLocationProviderClient with PRIORITY_HIGH_ACCURACY
 * - Kalman filter for GPS smoothing (reduces jitter/drift)
 * - Sensor fusion with accelerometer for movement detection
 * - Adaptive update intervals based on movement state
 * - WakeLock to prevent GPS interruption during background operation
 * - Robust error handling for GPS unavailable scenarios
 */
class LocationService : Service(), SensorEventListener {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var wakeLock: PowerManager.WakeLock? = null

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val repository = Repository()

    // Kalman filter for GPS smoothing
    private val kalmanFilter = KalmanLatLong()
    private val speedSmoother = SpeedSmoother(alpha = 0.35)
    private val bearingSmoother = BearingSmoother(alpha = 0.4)

    // Movement detection from accelerometer
    private var isMoving = true // Assume moving by default for racing
    private var lastAccelMagnitude = 0f
    private val accelThreshold = 0.5f // m/s² threshold for movement detection

    // GPS health monitoring
    private var consecutiveGpsFailures = 0
    private var lastValidLocationTime = 0L
    private val gpsTimeoutMs = 5000L // Consider GPS lost after 5 seconds without update

    private val _locationState = MutableStateFlow(LocationState())
    val locationState: StateFlow<LocationState> = _locationState

    data class LocationState(
        val latitude: Double = 0.0,
        val longitude: Double = 0.0,
        val speed: Double = 0.0,
        val heading: Double = 0.0,
        val accuracy: Float = 0f,
        val isGpsAvailable: Boolean = true,
        val satellites: Int = 0
    )

    companion object {
        private const val TAG = "LocationService"
        private const val CHANNEL_ID = "location_service_channel"
        private const val NOTIFICATION_ID = 1

        // Optimal settings for racing/driving - high frequency, high accuracy
        private const val UPDATE_INTERVAL_MOVING_MS = 200L    // 5 Hz when moving
        private const val UPDATE_INTERVAL_STATIONARY_MS = 1000L // 1 Hz when stationary
        private const val FASTEST_UPDATE_INTERVAL_MS = 100L   // Cap at 10 Hz max
        private const val MIN_DISPLACEMENT_METERS = 0.5f      // Update even with small movement

        // Accuracy thresholds
        private const val MAX_ACCEPTABLE_ACCURACY = 30f // meters - reject worse readings
        private const val EXCELLENT_ACCURACY = 5f       // meters - very good GPS
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "LocationService onCreate")

        createNotificationChannel()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        setupLocationCallback()
        setupSensorManager()
        acquireWakeLock()

        // Configure Kalman filter for driving - expect movement up to 50 m/s (~180 km/h)
        kalmanFilter.setProcessNoise(15.0) // Expect significant movement
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "LocationService onStartCommand")
        startForeground(NOTIFICATION_ID, createNotification())
        startLocationUpdates()
        startSensorUpdates()

        // Set online status
        serviceScope.launch {
            repository.setOnlineStatus(true)
        }

        // Start GPS health monitoring
        startGpsHealthMonitor()

        return START_STICKY
    }

    override fun onDestroy() {
        Log.d(TAG, "LocationService onDestroy")
        super.onDestroy()
        stopLocationUpdates()
        stopSensorUpdates()
        releaseWakeLock()

        // Set offline status - use runBlocking to ensure completion
        runBlocking {
            repository.setOnlineStatus(false)
        }

        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ========== NOTIFICATION ==========

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "GPS Tracking",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "High-accuracy GPS tracking for racing"
            setShowBadge(false)
        }

        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(channel)
    }

    private fun createNotification(): Notification {
        // Intent to open app when notification is tapped
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
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

    // ========== LOCATION UPDATES ==========

    private fun setupLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { location ->
                    processLocation(location)
                }
            }

            override fun onLocationAvailability(availability: LocationAvailability) {
                val isAvailable = availability.isLocationAvailable
                Log.d(TAG, "Location availability changed: $isAvailable")

                if (!isAvailable) {
                    _locationState.value = _locationState.value.copy(isGpsAvailable = false)
                    consecutiveGpsFailures++

                    // Try to recover GPS
                    if (consecutiveGpsFailures > 3) {
                        Log.w(TAG, "Multiple GPS failures, attempting recovery...")
                        restartLocationUpdates()
                    }
                } else {
                    consecutiveGpsFailures = 0
                    _locationState.value = _locationState.value.copy(isGpsAvailable = true)
                }
            }
        }
    }

    private fun processLocation(location: Location) {
        // Reject obviously bad readings
        if (location.accuracy > MAX_ACCEPTABLE_ACCURACY || location.accuracy <= 0) {
            Log.d(TAG, "Rejecting poor accuracy reading: ${location.accuracy}m")
            return
        }

        // Update GPS health tracking
        lastValidLocationTime = System.currentTimeMillis()
        consecutiveGpsFailures = 0

        // Apply Kalman filter for position smoothing
        val filteredLocation = kalmanFilter.filter(location)
        if (filteredLocation == null) {
            Log.d(TAG, "Kalman filter rejected location")
            return
        }

        // Smooth speed (convert m/s to km/h)
        val smoothedSpeedKmh = if (location.hasSpeed() && location.speed > 0.3f) {
            speedSmoother.smooth(location.speed) * 3.6
        } else {
            // If speed is very low or unavailable, set to 0
            speedSmoother.smooth(0f)
            0.0
        }

        // Smooth bearing
        val smoothedBearing = if (location.hasBearing() && location.speed > 1.0f) {
            bearingSmoother.smooth(location.bearing)
        } else {
            bearingSmoother.getSmoothedBearing()
        }

        // Update state
        _locationState.value = LocationState(
            latitude = filteredLocation.latitude,
            longitude = filteredLocation.longitude,
            speed = smoothedSpeedKmh,
            heading = smoothedBearing,
            accuracy = filteredLocation.accuracy,
            isGpsAvailable = true,
            satellites = location.extras?.getInt("satellites", 0) ?: 0
        )

        // Send to Supabase (use filtered values)
        serviceScope.launch {
            repository.updateGpsTelemetry(
                latitude = filteredLocation.latitude,
                longitude = filteredLocation.longitude,
                speed = smoothedSpeedKmh,
                heading = smoothedBearing,
                accuracy = filteredLocation.accuracy.toDouble(),
                batteryLevel = getBatteryLevel(),
                signalStrength = getSignalStrength(),
                isOnline = true
            )
        }

        // Log excellent accuracy readings
        if (location.accuracy <= EXCELLENT_ACCURACY) {
            Log.d(TAG, "Excellent GPS: ${location.accuracy}m at (${filteredLocation.latitude}, ${filteredLocation.longitude})")
        }
    }

    private fun startLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.e(TAG, "Location permission not granted")
            return
        }

        // Check if GPS is enabled
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        if (!locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            Log.w(TAG, "GPS is disabled - location accuracy will be limited")
            _locationState.value = _locationState.value.copy(isGpsAvailable = false)
        }

        val locationRequest = createLocationRequest()

        // Request with current settings
        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
            Log.d(TAG, "Location updates started with interval: ${locationRequest.intervalMillis}ms")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start location updates: ${e.message}")
        }

        // Also get last known location for quick first fix
        fusedLocationClient.lastLocation.addOnSuccessListener { location ->
            location?.let {
                if (it.accuracy <= MAX_ACCEPTABLE_ACCURACY) {
                    Log.d(TAG, "Using last known location for quick start")
                    processLocation(it)
                }
            }
        }
    }

    private fun createLocationRequest(): LocationRequest {
        return LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            if (isMoving) UPDATE_INTERVAL_MOVING_MS else UPDATE_INTERVAL_STATIONARY_MS
        ).apply {
            // Fastest interval caps the maximum update rate
            setMinUpdateIntervalMillis(FASTEST_UPDATE_INTERVAL_MS)

            // Minimum displacement to trigger update
            setMinUpdateDistanceMeters(MIN_DISPLACEMENT_METERS)

            // Don't wait for accurate location - we want fast updates and will filter ourselves
            setWaitForAccurateLocation(false)

            // Ensure location updates work even with poor accuracy
            setGranularity(Granularity.GRANULARITY_FINE)

            // For racing, we want maximum location quality
            setMaxUpdateDelayMillis(0) // No batching
        }.build()
    }

    private fun stopLocationUpdates() {
        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
            Log.d(TAG, "Location updates stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping location updates: ${e.message}")
        }
    }

    private fun restartLocationUpdates() {
        Log.d(TAG, "Restarting location updates...")
        stopLocationUpdates()

        // Reset Kalman filter on GPS recovery
        kalmanFilter.reset()
        speedSmoother.reset()
        bearingSmoother.reset()

        // Small delay before restart
        serviceScope.launch {
            delay(500)
            withContext(Dispatchers.Main) {
                startLocationUpdates()
            }
        }
    }

    // ========== SENSOR FUSION ==========

    private fun setupSensorManager() {
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)

        if (accelerometer == null) {
            Log.w(TAG, "Linear acceleration sensor not available, falling back to accelerometer")
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        }
    }

    private fun startSensorUpdates() {
        accelerometer?.let { sensor ->
            // Use SENSOR_DELAY_GAME for smooth motion detection
            sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
            Log.d(TAG, "Accelerometer updates started")
        }
    }

    private fun stopSensorUpdates() {
        sensorManager.unregisterListener(this)
        Log.d(TAG, "Sensor updates stopped")
    }

    override fun onSensorChanged(event: SensorEvent?) {
        event?.let {
            if (it.sensor.type == Sensor.TYPE_LINEAR_ACCELERATION ||
                it.sensor.type == Sensor.TYPE_ACCELEROMETER
            ) {
                // Calculate acceleration magnitude
                val x = it.values[0]
                val y = it.values[1]
                val z = it.values[2]
                val magnitude = sqrt(x * x + y * y + z * z)

                // Detect movement state change
                val wasMoving = isMoving
                isMoving = abs(magnitude - lastAccelMagnitude) > accelThreshold ||
                        magnitude > 1.0f // Any significant acceleration

                lastAccelMagnitude = magnitude

                // Adjust location request if movement state changed significantly
                if (wasMoving != isMoving) {
                    Log.d(TAG, "Movement state changed: moving=$isMoving")
                    // Don't restart for racing - always use high frequency
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        Log.d(TAG, "Sensor accuracy changed: $accuracy")
    }

    // ========== GPS HEALTH MONITORING ==========

    private fun startGpsHealthMonitor() {
        serviceScope.launch {
            while (isActive) {
                delay(gpsTimeoutMs)

                val timeSinceLastUpdate = System.currentTimeMillis() - lastValidLocationTime
                if (lastValidLocationTime > 0 && timeSinceLastUpdate > gpsTimeoutMs) {
                    Log.w(TAG, "GPS timeout - no update for ${timeSinceLastUpdate}ms")
                    _locationState.value = _locationState.value.copy(isGpsAvailable = false)

                    // Attempt recovery
                    if (timeSinceLastUpdate > gpsTimeoutMs * 2) {
                        restartLocationUpdates()
                    }
                }
            }
        }
    }

    // ========== WAKELOCK FOR BACKGROUND ==========

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "VeraTeam::LocationWakeLock"
        ).apply {
            acquire(60 * 60 * 1000L) // 1 hour max (for a race session)
        }
        Log.d(TAG, "WakeLock acquired")
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "WakeLock released")
            }
        }
        wakeLock = null
    }

    // ========== UTILITY FUNCTIONS ==========

    private fun getBatteryLevel(): Int {
        val batteryIntent = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) {
            (level * 100 / scale)
        } else {
            100
        }
    }

    private fun getSignalStrength(): Int {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return 0
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return 0

        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> 100
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> 75
            else -> 50
        }
    }
}
