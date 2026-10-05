package com.example.uthjabsdk.core.sync

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
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

interface SnapshotHttpClient {
    suspend fun fetchSnapshot(endpointUrl: String, readToken: String?): SnapshotFetchResult
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
    private var resultProvider: (endpoint: String, token: String?) -> SnapshotFetchResult
) : SnapshotHttpClient {

    val invocationLog = mutableListOf<Pair<String, String?>>()

    fun setResult(result: SnapshotFetchResult) {
        resultProvider = { _, _ -> result }
    }

    fun setResultProvider(provider: (String, String?) -> SnapshotFetchResult) {
        resultProvider = provider
    }

    override suspend fun fetchSnapshot(endpointUrl: String, readToken: String?): SnapshotFetchResult {
        invocationLog.add(endpointUrl to readToken)
        return resultProvider(endpointUrl, readToken)
    }
}
