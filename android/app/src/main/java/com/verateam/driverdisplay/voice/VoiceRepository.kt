package com.verateam.driverdisplay.voice

import android.util.Log
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Fetches a LiveKit access token for the Android driver from the same Vercel
 * endpoint the web frontend uses. The driver joins anonymously with a fixed
 * display name so the pit crew sees them as "Driver" on the dashboard.
 */
class VoiceRepository(
    private val tokenEndpoint: String = DEFAULT_TOKEN_ENDPOINT,
    private val driverName: String = "Driver",
) {
    companion object {
        private const val TAG = "VoiceRepository"
        private const val DEFAULT_TOKEN_ENDPOINT =
            "https://dashboard.chalmersverateam.se/api/livekit-token"
    }

    private val json = Json { ignoreUnknownKeys = true }

    private val client = HttpClient(OkHttp) {
        install(ContentNegotiation) { json(this@VoiceRepository.json) }
    }

    @Serializable
    private data class TokenRequest(val kind: String, val name: String)

    @Serializable
    data class TokenResponse(
        val token: String,
        val url: String,
        val room: String,
        val canPublish: Boolean,
        val identity: String,
    )

    suspend fun fetchToken(): TokenResponse? {
        return try {
            val resp = client.post(tokenEndpoint) {
                contentType(ContentType.Application.Json)
                setBody(TokenRequest(kind = "web", name = driverName))
            }
            if (!resp.status.isSuccess()) {
                Log.e(TAG, "Token endpoint returned ${resp.status}: ${resp.bodyAsText()}")
                return null
            }
            json.decodeFromString(TokenResponse.serializer(), resp.bodyAsText())
        } catch (e: Exception) {
            Log.e(TAG, "Token fetch failed: ${e.message}", e)
            null
        }
    }
}
