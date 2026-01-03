package com.verateam.driverdisplay.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.verateam.driverdisplay.data.TrackFlag
import com.verateam.driverdisplay.ui.theme.*

@Composable
fun FlagIndicator(
    flags: List<TrackFlag>,
    modifier: Modifier = Modifier
) {
    Panel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            DataLabel("Flags")
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                flags.forEach { flag ->
                    FlagDot(
                        color = getFlagColor(flag.color),
                        label = flag.flagId.takeLast(1)
                    )
                }
            }
        }
    }
}

@Composable
private fun FlagDot(
    color: Color,
    label: String
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(color)
                .border(2.dp, color.copy(alpha = 0.5f), CircleShape)
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = OnSurfaceVariant,
            fontSize = 10.sp
        )
    }
}

private fun getFlagColor(colorName: String): Color {
    return when (colorName.lowercase()) {
        "green" -> RacingGreen
        "red" -> RacingRed
        "yellow" -> RacingYellow
        "blue" -> RacingBlue
        else -> OnSurfaceVariant // Grey for inactive
    }
}
