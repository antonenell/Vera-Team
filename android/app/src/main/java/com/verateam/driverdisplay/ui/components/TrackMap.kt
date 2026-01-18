package com.verateam.driverdisplay.ui.components

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapInitOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.MapboxOptions
import com.mapbox.maps.plugin.annotation.annotations
import com.mapbox.maps.plugin.annotation.generated.CircleAnnotation
import com.mapbox.maps.plugin.annotation.generated.CircleAnnotationManager
import com.mapbox.maps.plugin.annotation.generated.CircleAnnotationOptions
import com.mapbox.maps.plugin.annotation.generated.createCircleAnnotationManager
import com.verateam.driverdisplay.R
import com.verateam.driverdisplay.ui.theme.MutedForeground
import com.verateam.driverdisplay.ui.theme.RacingGreen

// Mapbox style URL (your custom style)
private const val MAPBOX_STYLE_URL = "mapbox://styles/carlberge/cmj42ghcf009601r47hgyaiku/draft"

// Track configurations matching the web app
data class TrackConfig(
    val name: String,
    val bounds: Pair<Pair<Double, Double>, Pair<Double, Double>>, // [[lng, lat], [lng, lat]]
    val center: Pair<Double, Double>, // [lng, lat]
    val zoom: Double,
    val flags: List<FlagPosition>
)

data class FlagPosition(
    val id: Int,
    val coords: Pair<Double, Double> // [lng, lat]
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

@Composable
fun TrackMap(
    latitude: Double,
    longitude: Double,
    isCarOnline: Boolean,
    flags: Map<String, String>, // flagId -> color (grey, yellow, red, black)
    selectedTrack: String = "stora-holm",
    modifier: Modifier = Modifier
) {
    val track = tracks[selectedTrack] ?: tracks["stora-holm"]!!
    val context = LocalContext.current

    // Remember map view and annotation manager
    var circleAnnotationManager by remember { mutableStateOf<CircleAnnotationManager?>(null) }
    var carAnnotation by remember { mutableStateOf<CircleAnnotation?>(null) }
    var isMapReady by remember { mutableStateOf(false) }

    // Initialize Mapbox access token once
    LaunchedEffect(Unit) {
        val accessToken = context.getString(R.string.mapbox_access_token)
        MapboxOptions.accessToken = accessToken
    }

    Panel(
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = track.name,
                    color = MutedForeground,
                    fontSize = 12.sp
                )
                Text(
                    text = if (isCarOnline) "LIVE" else "OFFLINE",
                    color = if (isCarOnline) RacingGreen else MutedForeground,
                    fontSize = 10.sp
                )
            }

            // Map container
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = 8.dp)
                    .clip(RoundedCornerShape(8.dp))
            ) {
                AndroidView(
                    factory = { ctx ->
                        // Set access token before creating MapView
                        val accessToken = ctx.getString(R.string.mapbox_access_token)
                        MapboxOptions.accessToken = accessToken

                        MapView(ctx).apply {
                            // Set initial camera position
                            mapboxMap.setCamera(
                                CameraOptions.Builder()
                                    .center(Point.fromLngLat(track.center.first, track.center.second))
                                    .zoom(track.zoom)
                                    .build()
                            )

                            // Load custom style
                            mapboxMap.loadStyle(MAPBOX_STYLE_URL) { _ ->
                                // Create annotation manager after style is loaded
                                circleAnnotationManager = annotations.createCircleAnnotationManager()
                                isMapReady = true
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )
            }

            // Coordinates footer
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Lat: ${if (latitude != 0.0) String.format("%.5f", latitude) else "--"}",
                    color = MutedForeground,
                    fontSize = 10.sp
                )
                Text(
                    text = "Lng: ${if (longitude != 0.0) String.format("%.5f", longitude) else "--"}",
                    color = MutedForeground,
                    fontSize = 10.sp
                )
            }
        }
    }

    // Update car marker when position changes
    LaunchedEffect(isMapReady, isCarOnline, latitude, longitude) {
        if (!isMapReady) return@LaunchedEffect

        val manager = circleAnnotationManager ?: return@LaunchedEffect

        // Remove old car annotation
        carAnnotation?.let {
            manager.delete(it)
            carAnnotation = null
        }

        // Add new car marker if online and has valid position
        if (isCarOnline && latitude != 0.0 && longitude != 0.0) {
            val circleAnnotationOptions = CircleAnnotationOptions()
                .withPoint(Point.fromLngLat(longitude, latitude))
                .withCircleRadius(8.0)
                .withCircleColor("#22C55E") // Racing green
                .withCircleStrokeWidth(2.0)
                .withCircleStrokeColor("#FFFFFF")

            carAnnotation = manager.create(circleAnnotationOptions)
        }
    }
}
