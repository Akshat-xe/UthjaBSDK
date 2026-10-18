package com.example.uthjabsdk.core.sync

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

sealed interface PhoneActionFetchResult {
    data class Success(val revision: Long, val stateJson: String) : PhoneActionFetchResult
    data object NotFound : PhoneActionFetchResult
    data class HttpError(val status: Int) : PhoneActionFetchResult
    data object NetworkError : PhoneActionFetchResult
}

sealed interface PhoneActionPutResult {
    data class Success(val revision: Long) : PhoneActionPutResult
    data object Conflict : PhoneActionPutResult
    data class HttpError(val status: Int) : PhoneActionPutResult
    data object NetworkError : PhoneActionPutResult
}

interface PhoneActionHttpClient {
    suspend fun fetch(endpointUrl: String, ownerToken: String): PhoneActionFetchResult
    suspend fun put(
        endpointUrl: String,
        ownerToken: String,
        expectedRevision: Long?,
        mutationId: String,
        stateJson: String
    ): PhoneActionPutResult
}

/** A single request per explicit restore or local edit; this client never polls in the background. */
class DefaultPhoneActionHttpClient : PhoneActionHttpClient {
    companion object {
        private const val MAX_STATE_BYTES = 512 * 1024
        private const val MAX_RESPONSE_BYTES = 600 * 1024
    }

    private fun actionsUrl(snapshotEndpoint: String): URL? {
        val parsed = try { URL(snapshotEndpoint.trim()) } catch (_: Exception) { null } ?: return null
        if (parsed.protocol != "https" || !parsed.host.endsWith(".convex.site") ||
            parsed.userInfo != null || parsed.query != null || parsed.ref != null ||
            parsed.port !in listOf(-1, 443) || parsed.path != "/mobile/snapshot") return null
        return URL("https://${parsed.host}/mobile/actions")
    }

    private fun connection(url: URL, method: String, token: String): HttpURLConnection =
        (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            instanceFollowRedirects = false
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("User-Agent", "UthJaBsdk-Android/1.0")
        }

    private fun readBounded(input: java.io.InputStream?): String? {
        if (input == null) return null
        return input.use { stream ->
            val result = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val count = stream.read(buffer)
                if (count < 0) break
                if (result.size() + count > MAX_RESPONSE_BYTES) return@use null
                result.write(buffer, 0, count)
            }
            result.toString(Charsets.UTF_8.name())
        }
    }

    override suspend fun fetch(endpointUrl: String, ownerToken: String): PhoneActionFetchResult =
        withContext(Dispatchers.IO) {
            val url = actionsUrl(endpointUrl) ?: return@withContext PhoneActionFetchResult.NetworkError
            if (ownerToken.length < 32) return@withContext PhoneActionFetchResult.HttpError(401)
            var request: HttpURLConnection? = null
            try {
                request = connection(url, "GET", ownerToken)
                when (val status = request.responseCode) {
                    404 -> PhoneActionFetchResult.NotFound
                    200 -> {
                        val body = readBounded(request.inputStream)
                            ?: return@withContext PhoneActionFetchResult.NetworkError
                        val root = JsonParser.parseObject(body)
                        val revision = (root["revision"] as? Number)?.toLong()
                        val state = root["state"] as? Map<*, *>
                        if ((root["schemaVersion"] as? Number)?.toInt() != 1 ||
                            revision == null || revision < 1 || state == null) {
                            PhoneActionFetchResult.NetworkError
                        } else {
                            PhoneActionFetchResult.Success(revision, JsonParser.toJson(state))
                        }
                    }
                    else -> PhoneActionFetchResult.HttpError(status)
                }
            } catch (_: Exception) {
                PhoneActionFetchResult.NetworkError
            } finally {
                request?.disconnect()
            }
        }

    override suspend fun put(
        endpointUrl: String,
        ownerToken: String,
        expectedRevision: Long?,
        mutationId: String,
        stateJson: String
    ): PhoneActionPutResult = withContext(Dispatchers.IO) {
        val url = actionsUrl(endpointUrl) ?: return@withContext PhoneActionPutResult.NetworkError
        if (ownerToken.length < 32) return@withContext PhoneActionPutResult.HttpError(401)
        val stateBytes = stateJson.toByteArray(Charsets.UTF_8)
        if (stateBytes.size > MAX_STATE_BYTES) return@withContext PhoneActionPutResult.HttpError(413)
        var request: HttpURLConnection? = null
        try {
            val state = JsonParser.parseObject(stateJson)
            val body = JsonParser.toJson(mapOf(
                "schemaVersion" to 1,
                "expectedRevision" to expectedRevision,
                "mutationId" to mutationId,
                "state" to state
            )).toByteArray(Charsets.UTF_8)
            if (body.size > MAX_STATE_BYTES) return@withContext PhoneActionPutResult.HttpError(413)
            request = connection(url, "PUT", ownerToken).apply {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setFixedLengthStreamingMode(body.size)
            }
            request.outputStream.use { it.write(body) }
            when (val status = request.responseCode) {
                200 -> {
                    val response = readBounded(request.inputStream)
                        ?: return@withContext PhoneActionPutResult.NetworkError
                    val revision = (JsonParser.parseObject(response)["revision"] as? Number)?.toLong()
                    if (revision == null || revision < 1) PhoneActionPutResult.NetworkError
                    else PhoneActionPutResult.Success(revision)
                }
                409 -> PhoneActionPutResult.Conflict
                else -> PhoneActionPutResult.HttpError(status)
            }
        } catch (_: Exception) {
            PhoneActionPutResult.NetworkError
        } finally {
            request?.disconnect()
        }
    }
}
