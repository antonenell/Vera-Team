package com.verateam.driverdisplay

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.verateam.driverdisplay.service.LocationService
import com.verateam.driverdisplay.ui.screens.DriverDisplayScreen
import com.verateam.driverdisplay.ui.theme.Background
import com.verateam.driverdisplay.ui.theme.DriverDisplayTheme
import com.verateam.driverdisplay.ui.theme.RacingGreen
import com.verateam.driverdisplay.ui.theme.OnSurface
import com.verateam.driverdisplay.ui.theme.OnSurfaceVariant

class MainActivity : ComponentActivity() {

    private var hasLocationPermission by mutableStateOf(false)
    private var hasBackgroundPermission by mutableStateOf(false)
    private var isBatteryOptimizationDisabled by mutableStateOf(false)
    private var permissionStep by mutableIntStateOf(0) // 0: foreground, 1: background, 2: battery

    // Foreground location permission request
    private val foregroundLocationRequest = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true
        if (hasLocationPermission) {
            // Move to background permission step on Android 10+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                permissionStep = 1
            } else {
                // Pre-Android 10: no background permission needed
                hasBackgroundPermission = true
                permissionStep = 2
            }
        }
    }

    // Background location permission request (Android 10+)
    private val backgroundLocationRequest = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasBackgroundPermission = granted
        permissionStep = 2

        if (!granted) {
            Toast.makeText(
                this,
                "Background location recommended for accurate race tracking",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    // Battery optimization intent result
    private val batteryOptimizationRequest = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        checkBatteryOptimization()
        startLocationServiceIfReady()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on during racing
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Enable edge-to-edge and hide system bars for fullscreen
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        // Check initial permission states
        checkAllPermissions()

        setContent {
            DriverDisplayTheme {
                when {
                    // All permissions granted - show main screen
                    hasLocationPermission && (hasBackgroundPermission || permissionStep > 1) && permissionStep >= 2 -> {
                        DriverDisplayScreen()
                    }
                    // Need foreground location permission
                    !hasLocationPermission -> {
                        PermissionRequest(
                            title = "Location Permission Required",
                            description = "This app needs GPS access to track your position on the race map with high accuracy.",
                            buttonText = "Grant Location Access",
                            onRequestPermission = { requestForegroundLocation() }
                        )
                    }
                    // Need background location permission (Android 10+)
                    hasLocationPermission && !hasBackgroundPermission && permissionStep == 1 -> {
                        PermissionRequest(
                            title = "Background Location",
                            description = "For continuous GPS tracking during races, allow 'All the time' location access. This ensures tracking continues even when the screen is off.",
                            buttonText = "Allow Background Location",
                            secondaryButtonText = "Skip for now",
                            onRequestPermission = { requestBackgroundLocation() },
                            onSkip = {
                                hasBackgroundPermission = false
                                permissionStep = 2
                            }
                        )
                    }
                    // Battery optimization step
                    permissionStep == 2 && !isBatteryOptimizationDisabled -> {
                        PermissionRequest(
                            title = "Disable Battery Optimization",
                            description = "OnePlus/OxygenOS aggressively kills background apps. Disable battery optimization for reliable GPS tracking during your race session.",
                            buttonText = "Open Battery Settings",
                            secondaryButtonText = "Skip (not recommended)",
                            onRequestPermission = { requestBatteryOptimizationDisable() },
                            onSkip = { startLocationServiceIfReady() }
                        )
                    }
                    else -> {
                        // Fallback - show main screen
                        DriverDisplayScreen()
                    }
                }
            }
        }

        // Start location service if we already have all permissions
        if (hasLocationPermission) {
            startLocationServiceIfReady()
        }
    }

    override fun onResume() {
        super.onResume()
        // Re-check battery optimization status when returning to app
        checkBatteryOptimization()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopLocationService()
    }

    private fun checkAllPermissions() {
        hasLocationPermission = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        hasBackgroundPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true // Pre-Android 10 doesn't need this permission
        }

        checkBatteryOptimization()

        // Determine current step based on permissions
        permissionStep = when {
            !hasLocationPermission -> 0
            !hasBackgroundPermission && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> 1
            else -> 2
        }
    }

    private fun checkBatteryOptimization() {
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        isBatteryOptimizationDisabled = powerManager.isIgnoringBatteryOptimizations(packageName)
    }

    private fun requestForegroundLocation() {
        foregroundLocationRequest.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
        )
    }

    private fun requestBackgroundLocation() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            backgroundLocationRequest.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
    }

    @Suppress("BatteryLife")
    private fun requestBatteryOptimizationDisable() {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            batteryOptimizationRequest.launch(intent)
        } catch (e: Exception) {
            // Fallback: open battery settings directly
            try {
                val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                startActivity(intent)
            } catch (e2: Exception) {
                Toast.makeText(
                    this,
                    "Please manually disable battery optimization for this app",
                    Toast.LENGTH_LONG
                ).show()
            }
            startLocationServiceIfReady()
        }
    }

    private fun startLocationServiceIfReady() {
        if (hasLocationPermission) {
            val intent = Intent(this, LocationService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        }
    }

    private fun stopLocationService() {
        val intent = Intent(this, LocationService::class.java)
        stopService(intent)
    }
}

@Composable
fun PermissionRequest(
    title: String,
    description: String,
    buttonText: String,
    secondaryButtonText: String? = null,
    onRequestPermission: () -> Unit,
    onSkip: (() -> Unit)? = null
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(24.dp),
            modifier = Modifier.padding(horizontal = 48.dp)
        ) {
            Text(
                text = title,
                color = OnSurface,
                fontSize = 20.sp
            )
            Text(
                text = description,
                color = OnSurfaceVariant,
                textAlign = TextAlign.Center,
                lineHeight = 22.sp
            )
            Button(
                onClick = onRequestPermission,
                colors = ButtonDefaults.buttonColors(
                    containerColor = RacingGreen
                ),
                modifier = Modifier.fillMaxWidth(0.6f)
            ) {
                Text(buttonText)
            }
            if (secondaryButtonText != null && onSkip != null) {
                Button(
                    onClick = onSkip,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = OnSurfaceVariant.copy(alpha = 0.3f)
                    ),
                    modifier = Modifier.fillMaxWidth(0.6f)
                ) {
                    Text(secondaryButtonText, color = OnSurface.copy(alpha = 0.7f))
                }
            }
        }
    }
}
