package com.verateam.driverdisplay.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.verateam.driverdisplay.ui.theme.*

@Composable
fun LapProgress(
    currentLap: Int,
    totalLaps: Int,
    modifier: Modifier = Modifier
) {
    val progress = if (totalLaps > 0) currentLap.toFloat() / totalLaps else 0f

    Panel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            DataLabel("Lap Progress")
            Spacer(modifier = Modifier.height(8.dp))

            // Lap counter
            Row(
                verticalAlignment = Alignment.Bottom
            ) {
                Text(
                    text = currentLap.toString(),
                    style = MaterialTheme.typography.displayLarge.copy(
                        fontSize = 48.sp,
                        fontWeight = FontWeight.Bold
                    ),
                    color = RacingGreen
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "/",
                    style = MaterialTheme.typography.headlineMedium,
                    color = OnSurfaceVariant
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = totalLaps.toString(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = OnSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Progress bar
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(SurfaceVariant)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(progress)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(4.dp))
                        .background(
                            brush = Brush.horizontalGradient(
                                colors = listOf(RacingGreen, RacingGreen.copy(alpha = 0.8f))
                            )
                        )
                )
            }

            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "${(progress * 100).toInt()}% complete",
                style = MaterialTheme.typography.labelSmall,
                color = OnSurfaceVariant
            )
        }
    }
}
