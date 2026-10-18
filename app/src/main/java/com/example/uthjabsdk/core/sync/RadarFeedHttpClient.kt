package com.example.uthjabsdk.core.sync

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

data class RadarFeed(val fetchedAt: Instant, val opportunities: List<SnapshotRadarOpportunity>)

sealed interface RadarFeedFetchResult {
    data class Success(val feed: RadarFeed) : RadarFeedFetchResult
    data object Unavailable : RadarFeedFetchResult
}

interface RadarFeedHttpClient {
    suspend fun fetch(snapshotEndpoint: String, ownerToken: String): RadarFeedFetchResult
}

/** Reads only the bounded public-source feed from the paired Convex deployment. */
class DefaultRadarFeedHttpClient : RadarFeedHttpClient {
    private val maxResponseBytes = 256 * 1024

    override suspend fun fetch(snapshotEndpoint: String, ownerToken: String): RadarFeedFetchResult =
        withContext(Dispatchers.IO) {
            val endpoint = try { URL(snapshotEndpoint.trim()) } catch (_: Exception) { null }
                ?: return@withContext RadarFeedFetchResult.Unavailable
            if (endpoint.protocol != "https" || !endpoint.host.endsWith(".convex.site") ||
                endpoint.host == ".convex.site" || endpoint.userInfo != null ||
                endpoint.query != null || endpoint.ref != null || endpoint.port !in listOf(-1, 443) ||
                endpoint.path != "/mobile/snapshot" || ownerToken.length < 32) {
                return@withContext RadarFeedFetchResult.Unavailable
            }
            var request: HttpURLConnection? = null
            try {
                val url = URL("https://${endpoint.host}/mobile/radar")
                request = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    instanceFollowRedirects = false
                    connectTimeout = 10_000
                    readTimeout = 15_000
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Authorization", "Bearer $ownerToken")
                    setRequestProperty("User-Agent", "UthJaBsdk-Android/1.0")
                }
                if (request.responseCode != 200) return@withContext RadarFeedFetchResult.Unavailable
                val body = request.inputStream.use { input ->
                    val buffer = ByteArray(8192)
                    val output = ByteArrayOutputStream()
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        if (output.size() + count > maxResponseBytes) {
                            return@withContext RadarFeedFetchResult.Unavailable
                        }
                        output.write(buffer, 0, count)
                    }
                    output.toString(Charsets.UTF_8.name())
                }
                RadarFeedParser.parse(body)?.let(RadarFeedFetchResult::Success)
                    ?: RadarFeedFetchResult.Unavailable
            } catch (_: Exception) {
                RadarFeedFetchResult.Unavailable
            } finally {
                request?.disconnect()
            }
        }
}

/** Parsing stays independent of Android APIs so malformed cloud rows can be tested on the JVM. */
object RadarFeedParser {
    @Suppress("UNCHECKED_CAST")
    fun parse(json: String): RadarFeed? {
        if (json.toByteArray(Charsets.UTF_8).size > 256 * 1024) return null
        val root = try { JsonParser.parseObject(json) } catch (_: Exception) { return null }
        if ((root["schemaVersion"] as? Number)?.toInt() != 1 || root["source"] != "unstop") return null
        val fetchedAt = try { Instant.parse(root["fetchedAt"] as? String ?: return null) }
            catch (_: Exception) { return null }
        val rows = root["opportunities"] as? List<Any?> ?: return null
        if (rows.size > 50) return null
        val items = rows.map { raw ->
            val opp = raw as? Map<String, Any?> ?: return null
            val id = (opp["id"] as? String)?.take(100)?.takeIf(String::isNotBlank) ?: return null
            val title = (opp["title"] as? String)?.take(180)?.takeIf(String::isNotBlank) ?: return null
            val eventUrl = ((opp["event_url"] ?: opp["eventUrl"]) as? String)?.take(500)
                ?: return null
            val link = try { URL(eventUrl) } catch (_: Exception) { return null }
            if (link.protocol != "https" || link.host != "unstop.com" ||
                link.userInfo != null || link.port !in listOf(-1, 443)) return null
            val analysis = opp["analysis"] as? Map<String, Any?>
            val details = opp["details"] as? Map<String, Any?>
            val skills = (opp["skills_required"] ?: opp["skills"]) as? List<Any?>
            SnapshotRadarOpportunity(
                id = id,
                title = title,
                organizer = (opp["organizer"] as? String ?: "").take(120),
                platform = "Unstop",
                eventUrl = eventUrl,
                mode = (opp["mode"] as? String ?: "").take(40),
                location = (opp["location"] as? String ?: "").take(120),
                locationLabel = (opp["locationLabel"] as? String ?: "").take(120),
                areaScope = (opp["areaScope"] as? String ?: "remote").take(40),
                distanceKm = (opp["distanceKm"] as? Number)?.toDouble(),
                startDate = (opp["startDate"] as? String)?.take(48),
                endDate = (opp["endDate"] as? String)?.take(48),
                registrationDeadline = ((opp["registration_deadline"] ?: opp["registrationDeadline"]) as? String)?.take(48),
                prizePool = ((opp["prizePool"] ?: opp["prize_pool"]) as? String ?: "").take(100),
                teamSize = (opp["teamSize"] as? String)?.take(60),
                tier = ((analysis?.get("tierKey") ?: opp["tier"]) as? String ?: "B").take(1),
                difficulty = ((analysis?.get("difficulty") ?: opp["difficulty"]) as? String ?: "unverified").take(20),
                effortHours = ((analysis?.get("effortHours") ?: opp["effortHours"]) as? String)?.take(40),
                confidence = ((analysis?.get("confidence") ?: opp["confidence"]) as? String)?.take(20),
                summary = (opp["summary"] as? String)?.take(500),
                description = ((details?.get("description") ?: opp["description"]) as? String)?.take(1000),
                skills = (skills ?: emptyList()).take(12).mapNotNull { (it as? String)?.take(40) }
            )
        }
        if (items.map { it.id }.toSet().size != items.size) return null
        return RadarFeed(fetchedAt, items)
    }
}
