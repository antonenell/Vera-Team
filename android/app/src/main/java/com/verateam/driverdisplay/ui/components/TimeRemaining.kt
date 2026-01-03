package com.verateam.driverdisplay.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.verateam.driverdisplay.ui.theme.OnSurface
import com.verateam.driverdisplay.ui.theme.RacingRed

@Composable
fun TimeRemaining(
    timeLeftSeconds: Int,
    totalRaceTime: Int,
    isRunning: Boolean,
    formatTime: (Int) -> String,
    modifier: Modifier = Modifier
) {
    // Show red when less than 5 minutes remaining
    val isLow = timeLeftSeconds < 300 && isRunning

    val textColor by animateColorAsState(
        targetValue = if (isLow) RacingRed else OnSurface,
        label = "timeColor"
    )

    val formattedTime = formatTime(timeLeftSeconds)

    Panel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            DataLabel("Time Remaining")
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = formattedTime,
                style = MaterialTheme.typography.displayLarge.copy(
                    fontSize = 64.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 4.sp
                ),
                color = textColor
            )
            if (!isRunning) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "PAUSED",
                    style = MaterialTheme.typography.labelSmall,
                    color = RacingRed,
                    letterSpacing = 2.sp
                )
            }
        }
    }
}
