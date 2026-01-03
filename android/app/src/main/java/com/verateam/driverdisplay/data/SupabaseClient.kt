package com.verateam.driverdisplay.data

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.ktor.client.engine.okhttp.OkHttp

object SupabaseClient {
    val client = createSupabaseClient(
        supabaseUrl = "https://oqnwuwrpawwiqjgehwjw.supabase.co",
        supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xbnd1d3JwYXd3aXFqZ2Vod2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMDc0ODEsImV4cCI6MjA4MjU4MzQ4MX0.bGLEbl9s-P4DHLfwyOWwcd6DEBk0WcTf3TGiWtSSb2w"
    ) {
        install(Postgrest)
        install(Realtime)

        httpEngine = OkHttp.create()
    }
}
