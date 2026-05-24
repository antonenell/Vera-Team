package com.verateam.driverdisplay.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.verateam.driverdisplay.ui.theme.RacingGreen
import com.verateam.driverdisplay.ui.theme.RacingRed
import com.verateam.driverdisplay.voice.VoiceController.VoiceState

/**
 * Compact voice-chat control. One circular primary button (join / mute toggle),
 * plus a small leave button when connected. Designed for the driver display —
 * unobtrusive, no participant list, no volume slider (use phone volume keys).
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
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        when (state) {
            VoiceState.Idle -> {
                PrimaryButton(
                    icon = Icons.Filled.Phone,
                    tint = Color.White,
                    background = if (hasMicPermission) RacingGreen else MaterialTheme.colorScheme.surfaceVariant,
                    contentDescription = if (hasMicPermission) "Anslut till voice" else "Mikrofon-tillstånd saknas",
                    onClick = onJoin,
                    enabled = hasMicPermission,
                )
            }
            VoiceState.Connecting,
            VoiceState.Reconnecting -> {
                PrimaryButton(
                    icon = Icons.Filled.Mic,
                    tint = Color.White,
                    background = MaterialTheme.colorScheme.surfaceVariant,
                    contentDescription = "Ansluter…",
                    onClick = { /* no-op while connecting */ },
                    enabled = false,
                )
            }
            is VoiceState.Connected -> {
                if (state.isMuted) {
                    PrimaryButton(
                        icon = Icons.Filled.MicOff,
                        tint = Color.White,
                        background = MaterialTheme.colorScheme.surfaceVariant,
                        contentDescription = "Unmute",
                        onClick = onToggleMute,
                    )
                } else {
                    PrimaryButton(
                        icon = Icons.Filled.Mic,
                        tint = Color.White,
                        background = RacingGreen,
                        contentDescription = "Mute",
                        onClick = onToggleMute,
                    )
                }
                SecondaryButton(
                    icon = Icons.Filled.Close,
                    tint = Color.White,
                    background = MaterialTheme.colorScheme.surfaceVariant,
                    contentDescription = "Lämna voice",
                    onClick = onLeave,
                )
            }
            is VoiceState.Error -> {
                PrimaryButton(
                    icon = Icons.Filled.Phone,
                    tint = Color.White,
                    background = RacingRed,
                    contentDescription = "Försök igen",
                    onClick = onJoin,
                )
            }
        }
    }
}

@Composable
private fun PrimaryButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    background: Color,
    contentDescription: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(background),
        colors = IconButtonDefaults.iconButtonColors(
            contentColor = tint,
            disabledContentColor = tint.copy(alpha = 0.6f),
        ),
    ) {
        Icon(icon, contentDescription = contentDescription, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun SecondaryButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    background: Color,
    contentDescription: String,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(background),
        colors = IconButtonDefaults.iconButtonColors(contentColor = tint),
    ) {
        Icon(icon, contentDescription = contentDescription, modifier = Modifier.size(16.dp))
    }
}
