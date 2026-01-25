package com.verateam.driverdisplay.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.verateam.driverdisplay.DriverUiState
import com.verateam.driverdisplay.DriverViewModel
import com.verateam.driverdisplay.ui.components.*
import com.verateam.driverdisplay.ui.theme.Background

@Composable
fun DriverDisplayScreen(
    viewModel: DriverViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    DriverDisplayContent(
        uiState = uiState,
        formatTime = viewModel::formatTime,
        getBestLapTime = { viewModel.getBestLapTime() }
    )
}

@Composable
fun DriverDisplayContent(
    uiState: DriverUiState,
    formatTime: (Int) -> String,
    @Suppress("UNUSED_PARAMETER") getBestLapTime: () -> Int?
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(16.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Top row: Time Remaining, Lap Progress, Speed
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Time Remaining - largest panel
                TimeRemaining(
                    timeLeftSeconds = uiState.timeLeftSeconds,
                    totalRaceTime = uiState.totalRaceTime,
                    isRunning = uiState.isRunning,
                    formatTime = formatTime,
                    modifier = Modifier
                        .weight(1.5f)
                        .fillMaxHeight()
                )

                // Lap Progress
                LapProgress(
                    currentLap = uiState.currentLap,
                    totalLaps = uiState.totalLaps,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                )

                // Speed
                SpeedDisplay(
                    speed = uiState.speed,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                )
            }

            // Bottom row: Current Lap Time, Track Map, Flags
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(0.7f),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Current Lap Time
                LapTimeDisplay(
                    label = "Current Lap",
                    time = formatTime(uiState.currentLapElapsed),
                    variant = LapTimeVariant.Current,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                )

                // Track Map (replaces Best Lap)
                TrackMap(
                    latitude = uiState.latitude,
                    longitude = uiState.longitude,
                    isCarOnline = uiState.isConnected,
                    flags = uiState.flags.associate { it.flagId to (it.color ?: "") },
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                )

                // Flags
                FlagIndicator(
                    flags = uiState.flags,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                )
            }
        }

        // Connection status indicator in top right
        ConnectionStatus(
            isConnected = uiState.isConnected,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(4.dp)
        )
    }
}
