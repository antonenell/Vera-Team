package com.verateam.driverdisplay.data

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.ktor.client.engine.okhttp.OkHttp

object SupabaseClient {
    val client = createSupabaseClient(
        supabaseUrl = "https://bnjnuzorqdvmawycuesl.supabase.co",
        supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuam51em9ycWR2bWF3eWN1ZXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjYxNTcsImV4cCI6MjA5NDIwMjE1N30.YY8917cYZNNaD5qnFcfaLYBmSs79uVTl1qMtAPFbtCI"
    ) {
        install(Postgrest)
        install(Realtime)

        httpEngine = OkHttp.create()
    }
}
