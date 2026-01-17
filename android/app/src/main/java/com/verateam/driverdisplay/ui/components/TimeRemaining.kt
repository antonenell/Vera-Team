package com.verateam.driverdisplay.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.verateam.driverdisplay.ui.theme.OnSurface
import com.verateam.driverdisplay.ui.theme.OnSurfaceVariant
import com.verateam.driverdisplay.ui.theme.RacingRed

@Composable
fun TimeRemaining(
    timeLeftSeconds: Int,
    totalRaceTime: Int,
    isRunning: Boolean,
    formatTime: (Int) -> String,
    modifier: Modifier = Modifier
) {
    // Show red when less than 2 minutes remaining
    val isLow = timeLeftSeconds < 120 && isRunning

    val textColor by animateColorAsState(
        targetValue = if (isLow) RacingRed else OnSurface,
        label = "timeColor"
    )

    // Pulse animation when time is low
    val pulseAlpha by animateFloatAsState(
        targetValue = if (isLow) 0.6f else 1f,
        animationSpec = tween(500),
        label = "pulse"
    )

    val formattedTime = formatTime(timeLeftSeconds)

    Panel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                DataLabel("Time Remaining")
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = formattedTime,
                style = MaterialTheme.typography.displayLarge.copy(
                    fontSize = 48.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 2.sp
                ),
                color = textColor,
                modifier = Modifier.alpha(if (isLow) pulseAlpha else 1f)
            )
            if (!isRunning) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "STOPPED",
                    style = MaterialTheme.typography.labelSmall,
                    color = OnSurfaceVariant,
                    letterSpacing = 2.sp
                )
            }
        }
    }
}
