package com.verateam.driverdisplay.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.verateam.driverdisplay.data.MeanSpeedTarget
import com.verateam.driverdisplay.ui.theme.OnSurfaceVariant
import com.verateam.driverdisplay.ui.theme.RacingGreen
import com.verateam.driverdisplay.ui.theme.RacingRed
import kotlin.math.roundToInt

/**
 * Target mean speed the driver must average over the remaining laps to make the
 * race plan. Colour-coded: green when on/ahead of pace, red when behind. Shows the
 * driver's actual average underneath for comparison.
 */
@Composable
fun MeanSpeedDisplay(
    target: MeanSpeedTarget,
    modifier: Modifier = Modifier
) {
    val accent = if (target.onPace) RacingGreen else RacingRed

    Panel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            DataLabel("Target Avg")
            Spacer(modifier = Modifier.height(6.dp))

            when {
                target.finished -> {
                    DataValue("DONE", color = RacingGreen, size = DataValueSize.Medium)
                }
                target.calibrating -> {
                    DataValue("--", color = OnSurfaceVariant, size = DataValueSize.Large)
                    Text(
                        text = "calibrating",
                        style = MaterialTheme.typography.labelMedium,
                        color = OnSurfaceVariant
                    )
                }
                else -> {
                    DataValue(
                        value = target.targetKmh.roundToInt().coerceIn(0, 999).toString(),
                        color = accent,
                        size = DataValueSize.Large
                    )
                    Text(
                        text = "km/h",
                        style = MaterialTheme.typography.labelMedium,
                        color = OnSurfaceVariant,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    // Arrow compares the driver's actual average to the target it sits next to.
                    val above = target.currentKmh >= target.targetKmh
                    Text(
                        text = "you ${target.currentKmh.roundToInt()} ${if (above) "▲" else "▼"}",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = accent
                    )
                }
            }
        }
    }
}
