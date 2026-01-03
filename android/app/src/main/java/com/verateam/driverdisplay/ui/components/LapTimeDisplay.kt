package com.verateam.driverdisplay.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.verateam.driverdisplay.ui.theme.OnSurface
import com.verateam.driverdisplay.ui.theme.RacingGreen
import com.verateam.driverdisplay.ui.theme.RacingYellow

enum class LapTimeVariant {
    Current, Best, Default
}

@Composable
fun LapTimeDisplay(
    label: String,
    time: String,
    variant: LapTimeVariant = LapTimeVariant.Default,
    modifier: Modifier = Modifier
) {
    val textColor = when (variant) {
        LapTimeVariant.Current -> RacingGreen
        LapTimeVariant.Best -> RacingYellow
        LapTimeVariant.Default -> OnSurface
    }

    Panel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            DataLabel(label)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = time,
                style = MaterialTheme.typography.displayMedium.copy(
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 2.sp
                ),
                color = textColor
            )
        }
    }
}

// Helper function to format seconds to MM:SS
fun formatLapTime(seconds: Int): String {
    val mins = seconds / 60
    val secs = seconds % 60
    return "%d:%02d".format(mins, secs)
}
