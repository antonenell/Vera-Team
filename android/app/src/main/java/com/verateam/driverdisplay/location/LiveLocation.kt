package com.verateam.driverdisplay.location

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Process-wide, on-device live location/speed produced by [LocationService].
 *
 * The driver's own display reads speed/position from here directly, so it
 * updates the instant a GPS fix arrives — instead of round-tripping the value
 * through Supabase (write + 500 ms poll + network), which added ~1 s of lag and
 * stopped updating whenever the network dropped. Supabase telemetry is still
 * sent in parallel, but only to feed the remote web dashboard / spectators.
 */
object LiveLocation {

    data class Data(
        val latitude: Double = 0.0,
        val longitude: Double = 0.0,
        val speedKmh: Double = 0.0,
        val headingDeg: Double = 0.0,
        val accuracyM: Float = 0f,
        val hasFix: Boolean = false,
        val updatedAtMs: Long = 0L,
    )

    private val _state = MutableStateFlow(Data())
    val state: StateFlow<Data> = _state.asStateFlow()

    fun update(data: Data) {
        _state.value = data
    }
}
