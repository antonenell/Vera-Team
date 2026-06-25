package com.verateam.driverdisplay.ui.components

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import com.verateam.driverdisplay.data.TrackFlag
import com.verateam.driverdisplay.ui.theme.*

private const val TAG = "TrackMap"

private const val MAPBOX_STYLE_URL = "mapbox://styles/carlberge/cmj42ghcf009601r47hgyaiku"

// Map rotation: a positive bearing rotates the map content counter-clockwise.
private const val MAP_BEARING = 20.0

/** Camera config per track (flag positions now come live from the database). */
data class TrackConfig(
    val name: String,
    val center: Pair<Double, Double>,
    val zoom: Double,
)

val tracks = mapOf(
    "silesia-ring" to TrackConfig("Silesia Ring", center = Pair(18.0944, 50.5291), zoom = 14.3),
    "stora-holm" to TrackConfig("Stora Holm", center = Pair(11.9177, 57.7762), zoom = 14.8),
)

private fun createCircleBitmap(color: Int, size: Int, strokeColor: Int = android.graphics.Color.WHITE, strokeWidth: Float = 4f): Bitmap {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.style = Paint.Style.FILL
    paint.color = color
    canvas.drawCircle(size / 2f, size / 2f, (size - strokeWidth) / 2f, paint)
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
    flags: List<TrackFlag>,
    selectedTrack: String = "silesia-ring",
    onTrackChange: (String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    var dropdownExpanded by remember { mutableStateOf(false) }
    val track = tracks[selectedTrack] ?: tracks.values.first()

    var mapView by remember { mutableStateOf<MapView?>(null) }
    var pointAnnotationManager by remember { mutableStateOf<PointAnnotationManager?>(null) }
    var carAnnotation by remember { mutableStateOf<PointAnnotation?>(null) }
    var flagAnnotations by remember { mutableStateOf<List<PointAnnotation>>(emptyList()) }
    var isMapReady by remember { mutableStateOf(false) }

    val yellowColor = Color(0xFFEAB308).toArgb()
    val redColor = Color(0xFFDC2626).toArgb()
    val blackColor = Color(0xFF1A1A1A).toArgb()
    val greyColor = Color(0xFF71717A).toArgb()
    val greenColor = Color(0xFF22C55E).toArgb()

    // Recenter when the track changes.
    LaunchedEffect(selectedTrack) {
        mapView?.mapboxMap?.setCamera(
            CameraOptions.Builder()
                .center(Point.fromLngLat(track.center.first, track.center.second))
                .zoom(track.zoom)
                .bearing(MAP_BEARING)
                .build()
        )
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(PanelBackground)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Track selector header
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(PanelBackground)
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { dropdownExpanded = true }
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(RacingGreen)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = track.name,
                        color = OnSurfaceVariant,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = 0.5.sp
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = "▼", color = OnSurfaceVariant, fontSize = 8.sp)

                    DropdownMenu(
                        expanded = dropdownExpanded,
                        onDismissRequest = { dropdownExpanded = false },
                        modifier = Modifier.background(Surface)
                    ) {
                        tracks.forEach { (key, trackConfig) ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        text = trackConfig.name,
                                        color = if (key == selectedTrack) RacingGreen else OnSurface,
                                        fontSize = 12.sp
                                    )
                                },
                                onClick = {
                                    onTrackChange(key)   // refetches flags for the new track
                                    dropdownExpanded = false
                                },
                                modifier = Modifier.background(
                                    if (key == selectedTrack) SurfaceVariant else Color.Transparent
                                )
                            )
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(bottomStart = 8.dp, bottomEnd = 8.dp))
            ) {
                AndroidView(
                    factory = { context ->
                        MapView(context).apply {
                            mapView = this
                            logo.enabled = false
                            attribution.enabled = false
                            compass.enabled = false
                            scalebar.enabled = false
                            mapboxMap.setCamera(
                                CameraOptions.Builder()
                                    .center(Point.fromLngLat(track.center.first, track.center.second))
                                    .zoom(track.zoom)
                                    .bearing(MAP_BEARING)
                                    .build()
                            )
                            mapboxMap.loadStyle(MAPBOX_STYLE_URL) {
                                mapboxMap.setCamera(
                                    CameraOptions.Builder()
                                        .center(Point.fromLngLat(track.center.first, track.center.second))
                                        .zoom(track.zoom)
                                        .bearing(MAP_BEARING)
                                        .build()
                                )
                                pointAnnotationManager = annotations.createPointAnnotationManager()
                                isMapReady = true
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }

    // Render flags from their live database positions (not hardcoded).
    LaunchedEffect(isMapReady, flags) {
        if (!isMapReady) return@LaunchedEffect
        val manager = pointAnnotationManager ?: return@LaunchedEffect

        flagAnnotations.forEach { manager.delete(it) }
        val newAnnotations = mutableListOf<PointAnnotation>()
        flags.forEach { flag ->
            val lng = flag.lng
            val lat = flag.lat
            if (lng != null && lat != null) {
                val color = when (flag.color) {
                    "yellow" -> yellowColor
                    "red" -> redColor
                    "black" -> blackColor
                    else -> greyColor
                }
                val bitmap = createCircleBitmap(color, 44)
                newAnnotations.add(
                    manager.create(
                        PointAnnotationOptions()
                            .withPoint(Point.fromLngLat(lng, lat))
                            .withIconImage(bitmap)
                    )
                )
            }
        }
        flagAnnotations = newAnnotations
        Log.d(TAG, "Rendered ${newAnnotations.size} flags from DB positions")
    }

    // Car marker.
    LaunchedEffect(isMapReady, isCarOnline, latitude, longitude) {
        if (!isMapReady) return@LaunchedEffect
        val manager = pointAnnotationManager ?: return@LaunchedEffect
        carAnnotation?.let { manager.delete(it); carAnnotation = null }
        if (isCarOnline && latitude != 0.0 && longitude != 0.0) {
            val bitmap = createCircleBitmap(greenColor, 32)
            carAnnotation = manager.create(
                PointAnnotationOptions()
                    .withPoint(Point.fromLngLat(longitude, latitude))
                    .withIconImage(bitmap)
            )
        }
    }

    DisposableEffect(Unit) {
        onDispose { mapView?.onDestroy() }
    }
}
