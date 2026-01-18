package com.verateam.driverdisplay

import android.app.Application
import com.mapbox.maps.MapboxOptions

class DriverDisplayApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        // Initialize Mapbox with access token before any map is created
        MapboxOptions.accessToken = getString(R.string.mapbox_access_token)
    }
}
