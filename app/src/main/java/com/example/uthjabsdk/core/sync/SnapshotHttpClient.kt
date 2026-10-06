package com.example.uthjabsdk.core.sync

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import java.net.HttpURLConnection
import java.net.URL

sealed interface SnapshotFetchResult {
    data class Success(
        val jsonString: String,
        val sha256Hex: String,
        val statusCode: Int
    ) : SnapshotFetchResult

    data class HttpError(
        val statusCode: Int,
        val message: String
    ) : SnapshotFetchResult

    data class NetworkError(
        val message: String,
        val cause: Throwable? = null
    ) : SnapshotFetchResult
}

sealed interface SyncRequestResult {
    data class Accepted(val requestId: String, val state: String) : SyncRequestResult
    data class HttpError(val statusCode: Int, val message: String) : SyncRequestResult
    data class NetworkError(val message: String, val cause: Throwable? = null) : SyncRequestResult
}

sealed interface SyncRequestStatusResult {
    data class Success(val state: String) : SyncRequestStatusResult
    data class HttpError(val statusCode: Int, val message: String) : SyncRequestStatusResult
    data class NetworkError(val message: String, val cause: Throwable? = null) : SyncRequestStatusResult
}

interface SnapshotHttpClient {
    suspend fun fetchSnapshot(endpointUrl: String, readToken: String?): SnapshotFetchResult
    suspend fun requestSync(endpointUrl: String, readToken: String?): SyncRequestResult
    suspend fun fetchSyncRequestStatus(
        endpointUrl: String,
        requestId: String,
        readToken: String?
    ): SyncRequestStatusResult
}

/**
 * Standard Android HTTPS client for manual SnapshotV1 GET.
 * Enforces HTTPS and sets Keystore-derived Bearer authorization token.
 */
class DefaultSnapshotHttpClient(
    private val allowInsecureHttpForLocalTest: Boolean = false
) : SnapshotHttpClient {

    companion object {
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 20_000
        private const val MAX_BODY_BYTES = 1_048_576
        private const val MAX_COMMAND_RESPONSE_BYTES = 4_096
    }

    private fun syncRequestUrl(endpointUrl: String): URL? {
        val parsed = try { URL(endpointUrl.trim()) } catch (_: Exception) { null } ?: return null
        if ((!allowInsecureHttpForLocalTest &&
                (parsed.protocol != "https" || !parsed.host.endsWith(".convex.site"))) ||
            parsed.userInfo != null || parsed.query != null || parsed.ref != null ||
            parsed.path != "/mobile/snapshot") return null
        return parsed
    }

    private fun commandConnection(url: URL, method: String, readToken: String?): HttpURLConnection =
        (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            instanceFollowRedirects = false
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "UthJaBsdk-Android/1.0")
            if (!readToken.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $readToken")
        }

    private fun readCommandResponse(connection: HttpURLConnection): String {
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        if (stream == null) return connection.responseMessage ?: "HTTP ${connection.responseCode}"
        return stream.use { input ->
            val response = ByteArrayOutputStream()
            val chunk = ByteArray(1024)
            while (true) {
                val count = input.read(chunk)
                if (count < 0) break
                if (response.size() + count > MAX_COMMAND_RESPONSE_BYTES) {
                    throw IllegalArgumentException("Sync request response exceeds 4 KiB limit")
                }
                response.write(chunk, 0, count)
            }
            response.toString(Charsets.UTF_8.name())
        }
    }

    override suspend fun requestSync(
        endpointUrl: String,
        readToken: String?
    ): SyncRequestResult = withContext(Dispatchers.IO) {
        val snapshotUrl = syncRequestUrl(endpointUrl)
            ?: return@withContext SyncRequestResult.NetworkError("A valid Convex HTTPS snapshot endpoint is required")
        if (readToken.isNullOrBlank()) {
            return@withContext SyncRequestResult.NetworkError("Phone read token is not configured")
        }
        var connection: HttpURLConnection? = null
        try {
            val url = URL(snapshotUrl.toExternalForm().removeSuffix("/mobile/snapshot") + "/mobile/sync-request")
            connection = commandConnection(url, "POST", readToken)
            val status = connection.responseCode
            val body = readCommandResponse(connection)
            if (status !in 200..299) {
                SyncRequestResult.HttpError(status, body.take(500))
            } else {
                val request = JsonParser.parseObject(body)["request"] as? Map<*, *>
                val id = request?.get("requestId") as? String
                val state = request?.get("state") as? String
                if (id.isNullOrBlank() || state == null || state !in setOf("pending", "running")) {
                    SyncRequestResult.NetworkError("Invalid sync request response")
                } else {
                    SyncRequestResult.Accepted(id, state)
                }
            }
        } catch (e: Exception) {
            SyncRequestResult.NetworkError(e.localizedMessage ?: e.javaClass.simpleName, e)
        } finally {
            connection?.disconnect()
        }
    }

    override suspend fun fetchSyncRequestStatus(
        endpointUrl: String,
        requestId: String,
        readToken: String?
    ): SyncRequestStatusResult = withContext(Dispatchers.IO) {
        val snapshotUrl = syncRequestUrl(endpointUrl)
            ?: return@withContext SyncRequestStatusResult.NetworkError("A valid Convex HTTPS snapshot endpoint is required")
        if (readToken.isNullOrBlank()) {
            return@withContext SyncRequestStatusResult.NetworkError("Phone read token is not configured")
        }
        if (requestId.isBlank() || requestId.length > 256) {
            return@withContext SyncRequestStatusResult.NetworkError("Invalid sync request id")
        }
        var connection: HttpURLConnection? = null
        try {
            val encodedId = URLEncoder.encode(requestId, Charsets.UTF_8.name())
            val url = URL(
                snapshotUrl.toExternalForm().removeSuffix("/mobile/snapshot") +
                    "/mobile/sync-request?id=$encodedId"
            )
            connection = commandConnection(url, "GET", readToken)
            val status = connection.responseCode
            val body = readCommandResponse(connection)
            if (status !in 200..299) {
                SyncRequestStatusResult.HttpError(status, body.take(500))
            } else {
                val state = JsonParser.parseObject(body)["state"] as? String
                if (state == null || state !in setOf("pending", "running", "completed", "failed", "expired")) {
                    SyncRequestStatusResult.NetworkError("Invalid sync request status response")
                } else {
                    SyncRequestStatusResult.Success(state)
                }
            }
        } catch (e: Exception) {
            SyncRequestStatusResult.NetworkError(e.localizedMessage ?: e.javaClass.simpleName, e)
        } finally {
            connection?.disconnect()
        }
    }

    override suspend fun fetchSnapshot(
        endpointUrl: String,
        readToken: String?
    ): SnapshotFetchResult = withContext(Dispatchers.IO) {
        val trimmedUrl = endpointUrl.trim()
        val parsedUrl = try { URL(trimmedUrl) } catch (_: Exception) { null }
        if (parsedUrl == null || (!allowInsecureHttpForLocalTest &&
                (parsedUrl.protocol != "https" || !parsedUrl.host.endsWith(".convex.site") ||
                    parsedUrl.userInfo != null || parsedUrl.query != null || parsedUrl.ref != null ||
                    parsedUrl.path != "/mobile/snapshot"))) {
            return@withContext SnapshotFetchResult.NetworkError(
                "A valid Convex HTTPS snapshot endpoint is required"
            )
        }

        var connection: HttpURLConnection? = null
        try {
            connection = (parsedUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                instanceFollowRedirects = false
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
                setRequestProperty("User-Agent", "UthJaBSDK-Android/1.0")

                if (!readToken.isNullOrBlank()) {
                    setRequestProperty("Authorization", "Bearer ${readToken.trim()}")
                }
            }

            val statusCode = connection.responseCode
            if (statusCode in 200..299) {
                val responseBytes = ByteArrayOutputStream()
                connection.inputStream.use { input ->
                    val chunk = ByteArray(8192)
                    while (true) {
                        val count = input.read(chunk)
                        if (count < 0) break
                        if (responseBytes.size() + count > MAX_BODY_BYTES) {
                            return@withContext SnapshotFetchResult.NetworkError("Snapshot exceeds 1 MiB limit")
                        }
                        responseBytes.write(chunk, 0, count)
                    }
                }
                val responseString = responseBytes.toString(Charsets.UTF_8.name())
                val sha256 = connection.getHeaderField("X-Snapshot-SHA256") ?: ""
                SnapshotFetchResult.Success(
                    jsonString = responseString,
                    sha256Hex = sha256,
                    statusCode = statusCode
                )
            } else {
                val errorStream = connection.errorStream
                val errorBody = if (errorStream != null) {
                    errorStream.bufferedReader(Charsets.UTF_8).use { it.readText() }.take(500)
                } else {
                    connection.responseMessage ?: "HTTP $statusCode"
                }
                SnapshotFetchResult.HttpError(
                    statusCode = statusCode,
                    message = errorBody
                )
            }
        } catch (e: Exception) {
            SnapshotFetchResult.NetworkError(
                message = e.localizedMessage ?: e.javaClass.simpleName,
                cause = e
            )
        } finally {
            connection?.disconnect()
        }
    }
}

/**
 * Mock snapshot client for unit testing and local mock scenarios.
 */
class MockSnapshotHttpClient(
    private var syncRequestResult: SyncRequestResult = SyncRequestResult.Accepted("mock-request", "completed"),
    private var syncStatusResult: SyncRequestStatusResult = SyncRequestStatusResult.Success("completed"),
    private var resultProvider: (endpoint: String, token: String?) -> SnapshotFetchResult
) : SnapshotHttpClient {

    val invocationLog = mutableListOf<Pair<String, String?>>()
    val syncRequestInvocationLog = mutableListOf<Pair<String, String?>>()
    val syncStatusInvocationLog = mutableListOf<Triple<String, String, String?>>()

    fun setResult(result: SnapshotFetchResult) {
        resultProvider = { _, _ -> result }
    }

    fun setResultProvider(provider: (String, String?) -> SnapshotFetchResult) {
        resultProvider = provider
    }

    fun setSyncRequestResult(result: SyncRequestResult) {
        syncRequestResult = result
    }

    fun setSyncStatusResult(result: SyncRequestStatusResult) {
        syncStatusResult = result
    }

    override suspend fun fetchSnapshot(endpointUrl: String, readToken: String?): SnapshotFetchResult {
        invocationLog.add(endpointUrl to readToken)
        return resultProvider(endpointUrl, readToken)
    }

    override suspend fun requestSync(endpointUrl: String, readToken: String?): SyncRequestResult {
        syncRequestInvocationLog.add(endpointUrl to readToken)
        return syncRequestResult
    }

    override suspend fun fetchSyncRequestStatus(
        endpointUrl: String,
        requestId: String,
        readToken: String?
    ): SyncRequestStatusResult {
        syncStatusInvocationLog.add(Triple(endpointUrl, requestId, readToken))
        return syncStatusResult
    }
}
