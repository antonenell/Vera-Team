package com.verateam.driverdisplay.ui.components

import android.content.Context
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.annotation.annotations
import com.mapbox.maps.plugin.annotation.generated.PointAnnotation
import com.mapbox.maps.plugin.annotation.generated.PointAnnotationManager
import com.mapbox.maps.plugin.annotation.generated.PointAnnotationOptions
import com.mapbox.maps.plugin.annotation.generated.createPointAnnotationManager
import com.mapbox.maps.plugin.attribution.attribution
import com.mapbox.maps.plugin.compass.compass
import com.mapbox.maps.plugin.logo.logo
import com.mapbox.maps.plugin.scalebar.scalebar
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint

private const val TAG = "TrackMap"

// Mapbox style URL - your custom published style
private const val MAPBOX_STYLE_URL = "mapbox://styles/carlberge/cmj42ghcf009601r47hgyaiku"

// Track configurations matching the web app
data class TrackConfig(
    val name: String,
    val bounds: Pair<Pair<Double, Double>, Pair<Double, Double>>,
    val center: Pair<Double, Double>,
    val zoom: Double,
    val flags: List<FlagPosition>
)

data class FlagPosition(
    val id: Int,
    val coords: Pair<Double, Double>
)

val tracks = mapOf(
    "stora-holm" to TrackConfig(
        name = "Stora Holm",
        bounds = Pair(Pair(11.9127, 57.7745), Pair(11.9228, 57.7779)),
        center = Pair(11.9177, 57.7762),
        zoom = 16.0,
        flags = listOf(
            FlagPosition(1, Pair(11.9141, 57.7771)),
            FlagPosition(2, Pair(11.9220, 57.7765)),
            FlagPosition(3, Pair(11.9196, 57.7751)),
            FlagPosition(4, Pair(11.9165, 57.7760))
        )
    ),
    "silesia-ring" to TrackConfig(
        name = "Silesia Ring",
        bounds = Pair(Pair(18.0844, 50.5241), Pair(18.1044, 50.5341)),
        center = Pair(18.0944, 50.5291),
        zoom = 15.0,
        flags = emptyList()
    )
)

// Create a circular bitmap marker
private fun createCircleBitmap(color: Int, size: Int, strokeColor: Int = android.graphics.Color.WHITE, strokeWidth: Float = 4f): Bitmap {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    // Draw fill
    paint.style = Paint.Style.FILL
    paint.color = color
    canvas.drawCircle(size / 2f, size / 2f, (size - strokeWidth) / 2f, paint)

    // Draw stroke
    paint.style = Paint.Style.STROKE
    paint.color = strokeColor
    paint.strokeWidth = strokeWidth
    canvas.drawCircle(size / 2f, size / 2f, (size - strokeWidth) / 2f, paint)

    return bitmap
}

@Composable
fun TrackMap(
    latitude: Double,
    longitude: Double,
    isCarOnline: Boolean,
    flags: Map<String, String>,
    selectedTrack: String = "stora-holm",
    modifier: Modifier = Modifier
) {
    val track = tracks[selectedTrack] ?: tracks["stora-holm"]!!

    // State for annotation manager and map
    var mapView by remember { mutableStateOf<MapView?>(null) }
    var pointAnnotationManager by remember { mutableStateOf<PointAnnotationManager?>(null) }
    var carAnnotation by remember { mutableStateOf<PointAnnotation?>(null) }
    var flagAnnotations by remember { mutableStateOf<List<PointAnnotation>>(emptyList()) }
    var isMapReady by remember { mutableStateOf(false) }

    // Colors matching the web app exactly
    val yellowColor = Color(0xFFEAB308).toArgb()
    val redColor = Color(0xFFDC2626).toArgb()
    val blackColor = Color(0xFF1A1A1A).toArgb()
    val greyColor = Color(0xFF71717A).toArgb()
    val greenColor = Color(0xFF22C55E).toArgb()

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
    ) {
        AndroidView(
            factory = { context ->
                MapView(context).apply {
                    mapView = this

                    // Hide logo, attribution, compass, and scalebar
                    logo.enabled = false
                    attribution.enabled = false
                    compass.enabled = false
                    scalebar.enabled = false

                    // Set camera FIRST before loading style
                    mapboxMap.setCamera(
                        CameraOptions.Builder()
                            .center(Point.fromLngLat(track.center.first, track.center.second))
                            .zoom(track.zoom)
                            .build()
                    )

                    Log.d(TAG, "Loading style: $MAPBOX_STYLE_URL")
                    Log.d(TAG, "Camera center: ${track.center}, zoom: ${track.zoom}")

                    // Load the style
                    mapboxMap.loadStyle(MAPBOX_STYLE_URL) { style ->
                        Log.d(TAG, "Style loaded successfully")

                        // Set camera again after style loads to ensure it sticks
                        mapboxMap.setCamera(
                            CameraOptions.Builder()
                                .center(Point.fromLngLat(track.center.first, track.center.second))
                                .zoom(track.zoom)
                                .build()
                        )

                        // Create point annotation manager
                        pointAnnotationManager = annotations.createPointAnnotationManager()
                        isMapReady = true
                    }
                }
            },
            modifier = Modifier.fillMaxSize()
        )
    }

    // Add flag markers when map is ready
    LaunchedEffect(isMapReady, flags) {
        if (!isMapReady) return@LaunchedEffect
        val manager = pointAnnotationManager ?: return@LaunchedEffect

        // Remove old flag annotations
        flagAnnotations.forEach { manager.delete(it) }
        flagAnnotations = emptyList()

        // Add flag markers
        val newFlagAnnotations = mutableListOf<PointAnnotation>()
        track.flags.forEach { flagPos ->
            val flagColor = flags[flagPos.id.toString()] ?: ""
            val color = when (flagColor) {
                "yellow" -> yellowColor
                "red" -> redColor
                "black" -> blackColor
                else -> greyColor
            }

            Log.d(TAG, "Flag ${flagPos.id}: flagColor='$flagColor', color=$color")

            val bitmap = createCircleBitmap(color, 40)

            val pointAnnotationOptions = PointAnnotationOptions()
                .withPoint(Point.fromLngLat(flagPos.coords.first, flagPos.coords.second))
                .withIconImage(bitmap)

            newFlagAnnotations.add(manager.create(pointAnnotationOptions))
        }
        flagAnnotations = newFlagAnnotations
    }

    // Update car marker when position changes
    LaunchedEffect(isMapReady, isCarOnline, latitude, longitude) {
        if (!isMapReady) return@LaunchedEffect
        val manager = pointAnnotationManager ?: return@LaunchedEffect

        // Remove old car annotation
        carAnnotation?.let {
            manager.delete(it)
            carAnnotation = null
        }

        // Add new car marker if online and has valid position
        if (isCarOnline && latitude != 0.0 && longitude != 0.0) {
            val bitmap = createCircleBitmap(greenColor, 32)

            val pointAnnotationOptions = PointAnnotationOptions()
                .withPoint(Point.fromLngLat(longitude, latitude))
                .withIconImage(bitmap)

            carAnnotation = manager.create(pointAnnotationOptions)
        }
    }

    // Cleanup
    DisposableEffect(Unit) {
        onDispose {
            mapView?.onDestroy()
        }
    }
}
