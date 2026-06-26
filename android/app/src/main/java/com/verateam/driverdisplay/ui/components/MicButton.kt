package com.verateam.driverdisplay.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.verateam.driverdisplay.ui.theme.OnSurfaceVariant
import com.verateam.driverdisplay.ui.theme.RacingGreen
import com.verateam.driverdisplay.ui.theme.RacingRed
import com.verateam.driverdisplay.ui.theme.RacingYellow
import com.verateam.driverdisplay.ui.theme.Surface as RacingSurface
import com.verateam.driverdisplay.voice.VoiceController.VoiceState

/**
 * Compact voice-chat panel for the driver display. One small rounded card with
 * a status indicator plus 1–2 text buttons depending on state.
 *
 * Designed to sit unobtrusively in the top-left corner. Volume is handled by
 * the device's physical volume keys.
 */
@Composable
fun MicButton(
    state: VoiceState,
    hasMicPermission: Boolean,
    onJoin: () -> Unit,
    onToggleMute: () -> Unit,
    onLeave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        color = RacingSurface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(10.dp),
        tonalElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            StatusRow(state, hasMicPermission)
            ActionRow(
                state = state,
                hasMicPermission = hasMicPermission,
                onJoin = onJoin,
                onToggleMute = onToggleMute,
                onLeave = onLeave,
            )
            if (state is VoiceState.Error) {
                Text(
                    text = state.message,
                    color = RacingRed,
                    fontSize = 10.sp,
                )
            }
        }
    }
}

@Composable
private fun StatusRow(state: VoiceState, hasMicPermission: Boolean) {
    val (color, label) = when {
        !hasMicPermission && state is VoiceState.Idle -> OnSurfaceVariant to "Mic permission required"
        state is VoiceState.Idle -> OnSurfaceVariant to "Voice"
        state is VoiceState.Connecting -> RacingYellow to "Connecting…"
        state is VoiceState.Reconnecting -> RacingYellow to "Reconnecting…"
        state is VoiceState.Connected -> RacingGreen to "Driver — connected"
        state is VoiceState.Error -> RacingRed to "Error"
        else -> OnSurfaceVariant to "Voice"
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(color)
        )
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 12.sp,
        )
    }
}

@Composable
private fun ActionRow(
    state: VoiceState,
    hasMicPermission: Boolean,
    onJoin: () -> Unit,
    onToggleMute: () -> Unit,
    onLeave: () -> Unit,
) {
    when (state) {
        VoiceState.Idle, is VoiceState.Error -> {
            Button(
                onClick = onJoin,
                enabled = hasMicPermission,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = RacingGreen),
                contentPadding = PaddingValues(vertical = 6.dp),
            ) {
                Text(if (state is VoiceState.Error) "Retry" else "Connect", fontSize = 13.sp)
            }
        }
        VoiceState.Connecting, VoiceState.Reconnecting -> {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Text("Connecting…", fontSize = 12.sp, color = OnSurfaceVariant)
            }
        }
        is VoiceState.Connected -> {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Button(
                    onClick = onToggleMute,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (state.isMuted) OnSurfaceVariant else RacingGreen
                    ),
                    contentPadding = PaddingValues(vertical = 6.dp),
                ) {
                    Text(if (state.isMuted) "Unmute" else "Mute", fontSize = 12.sp)
                }
                OutlinedButton(
                    onClick = onLeave,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(vertical = 6.dp),
                ) {
                    Text("Avsluta", fontSize = 12.sp)
                }
            }
        }
    }
}
