package com.verateam.driverdisplay.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.verateam.driverdisplay.ui.theme.OnSurface
import com.verateam.driverdisplay.ui.theme.OnSurfaceVariant
import kotlin.math.roundToInt

@Composable
fun SpeedDisplay(
    speed: Double,
    modifier: Modifier = Modifier
) {
    // Round to nearest (matches the web's Math.round) and don't cap, so the app
    // speedometer and the web "Speed" box always show the same number. Min 2 digits
    // for a steady layout; padStart never truncates, so 100+ km/h still renders.
    val speedInt = speed.roundToInt().coerceAtLeast(0)
    val speedFormatted = speedInt.toString().padStart(2, '0')

    Panel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            DataLabel("Speed")
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = speedFormatted,
                style = MaterialTheme.typography.displayLarge.copy(
                    fontSize = 80.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 4.sp
                ),
                color = OnSurface
            )
            Text(
                text = "km/h",
                style = MaterialTheme.typography.labelMedium,
                color = OnSurfaceVariant,
                letterSpacing = 1.sp
            )
        }
    }
}
