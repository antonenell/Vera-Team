package com.verateam.driverdisplay.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
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
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import com.verateam.driverdisplay.R
import com.verateam.driverdisplay.data.Repository
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class LocationService : Service() {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val repository = Repository()

    private val _locationState = MutableStateFlow<LocationState>(LocationState())
    val locationState: StateFlow<LocationState> = _locationState

    data class LocationState(
        val latitude: Double = 0.0,
        val longitude: Double = 0.0,
        val speed: Double = 0.0,
        val heading: Double = 0.0,
        val accuracy: Float = 0f
    )

    companion object {
        private const val CHANNEL_ID = "location_service_channel"
        private const val NOTIFICATION_ID = 1
        private const val UPDATE_INTERVAL_MS = 200L // 5 Hz = 200ms
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        setupLocationCallback()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        startLocationUpdates()

        // Set online status
        serviceScope.launch {
            repository.setOnlineStatus(true)
        }

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        stopLocationUpdates()

        // Set offline status
        serviceScope.launch {
            repository.setOnlineStatus(false)
        }

        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Location Service",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "GPS tracking for driver display"
        }

        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(channel)
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Vera Team Driver Display")
            .setContentText("GPS tracking active")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun setupLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { location ->
                    processLocation(location)
                }
            }
        }
    }

    private fun processLocation(location: Location) {
        // Convert speed from m/s to km/h
        val speedKmh = location.speed * 3.6

        _locationState.value = LocationState(
            latitude = location.latitude,
            longitude = location.longitude,
            speed = speedKmh,
            heading = location.bearing.toDouble(),
            accuracy = location.accuracy
        )

        // Send to Supabase
        serviceScope.launch {
            repository.updateGpsTelemetry(
                latitude = location.latitude,
                longitude = location.longitude,
                speed = speedKmh,
                heading = location.bearing.toDouble(),
                accuracy = location.accuracy.toDouble(),
                batteryLevel = getBatteryLevel(),
                signalStrength = getSignalStrength(),
                isOnline = true
            )
        }
    }

    private fun startLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            UPDATE_INTERVAL_MS
        ).apply {
            setMinUpdateIntervalMillis(UPDATE_INTERVAL_MS)
            setWaitForAccurateLocation(false)
        }.build()

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper()
        )
    }

    private fun stopLocationUpdates() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }

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
