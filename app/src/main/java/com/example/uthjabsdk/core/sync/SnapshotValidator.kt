package com.example.uthjabsdk.core.sync

import java.security.MessageDigest
import java.time.Instant

sealed class ValidationResult {
    data class Success(val snapshot: SnapshotV1, val sha256Hex: String) : ValidationResult()
    data class Error(val message: String) : ValidationResult()
}

object SnapshotValidator {

    private const val MAX_PAYLOAD_BYTES = 1024 * 1024 // 1 MiB
    private const val MAX_SUBJECTS = 100
    private const val MAX_SCHEDULE_DAYS = 14
    private const val MAX_SCHEDULE_ITEMS_PER_DAY = 8
    private const val MAX_EMAILS = 12
    private const val MAX_RADAR_OPPORTUNITIES = 50
    private const val MAX_RADAR_SKILLS = 12
    private const val MAX_MEAL_ITEMS = 40

    private val VALID_SOURCE_STATUSES = setOf(
        "success", "partial", "failed", "setup_required", "running", "unavailable"
    )
    private val VALID_FRESHNESS = setOf("fresh", "stale", "unknown")

    fun computeSha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(bytes)
        return hash.joinToString("") { "%02x".format(it) }
    }

    fun validate(rawJson: String): ValidationResult {
        val rawBytes = rawJson.toByteArray(Charsets.UTF_8)
        if (rawBytes.size > MAX_PAYLOAD_BYTES) {
            return ValidationResult.Error("Payload exceeds 1 MiB limit (${rawBytes.size} bytes)")
        }

        val sha256Hex = computeSha256(rawBytes)

        val root = try {
            JsonParser.parseObject(rawJson)
        } catch (e: Exception) {
            return ValidationResult.Error("JSON parse error: ${e.message}")
        }

        // Schema version check
        val schemaVersion = (root["schemaVersion"] as? Number)?.toInt()
        if (schemaVersion != 1) {
            return ValidationResult.Error("Unsupported schemaVersion '$schemaVersion'; expected 1")
        }

        // Revision check
        val revision = root["revision"] as? String
        if (revision.isNullOrBlank() || revision.length > 100) {
            return ValidationResult.Error("Invalid revision: must be 1..100 non-empty characters")
        }

        // Run ID check
        val runId = root["runId"] as? String
        if (runId.isNullOrBlank() || runId.length > 100) {
            return ValidationResult.Error("Invalid runId: must be 1..100 non-empty characters")
        }

        // PublishedAt timestamp check
        val publishedAt = root["publishedAt"] as? String
        if (publishedAt.isNullOrBlank()) {
            return ValidationResult.Error("Missing publishedAt timestamp")
        }
        try {
            Instant.parse(publishedAt)
        } catch (_: Exception) {
            return ValidationResult.Error("Invalid ISO-8601 publishedAt timestamp: '$publishedAt'")
        }

        // Sources check
        @Suppress("UNCHECKED_CAST")
        val sourcesMap = (root["sources"] as? Map<String, Any?>) ?: emptyMap()
        val parsedSources = mutableMapOf<String, SnapshotSource>()
        for ((name, srcObj) in sourcesMap) {
            @Suppress("UNCHECKED_CAST")
            val record = srcObj as? Map<String, Any?>
            val status = record?.get("status") as? String ?: "unavailable"
            if (!VALID_SOURCE_STATUSES.contains(status)) {
                return ValidationResult.Error("Invalid source status '$status' for source '$name'")
            }
            val freshness = record?.get("freshness") as? String ?: "unknown"
            if (!VALID_FRESHNESS.contains(freshness)) {
                return ValidationResult.Error("Invalid freshness '$freshness' for source '$name'")
            }
            val updatedAt = record?.get("updatedAt") as? String
            parsedSources[name] = SnapshotSource(status, freshness, updatedAt)
        }

        // Academic section check
        @Suppress("UNCHECKED_CAST")
        val academicMap = root["academic"] as? Map<String, Any?>
            ?: return ValidationResult.Error("Missing 'academic' section")
        val academic = parseAcademic(academicMap) ?: return ValidationResult.Error("Malformed academic section")

        // Radar section check
        @Suppress("UNCHECKED_CAST")
        val radarMap = root["radar"] as? Map<String, Any?>
            ?: return ValidationResult.Error("Missing 'radar' section")
        val radar = parseRadar(radarMap) ?: return ValidationResult.Error("Malformed radar section")

        // Menu section check
        @Suppress("UNCHECKED_CAST")
        val menuMap = root["menu"] as? Map<String, Any?>
            ?: return ValidationResult.Error("Missing 'menu' section")
        val menu = parseMenu(menuMap) ?: return ValidationResult.Error("Malformed menu section")

        val snapshot = SnapshotV1(
            schemaVersion = schemaVersion,
            revision = revision,
            runId = runId,
            publishedAt = publishedAt,
            sources = parsedSources,
            academic = academic,
            radar = radar,
            menu = menu,
            sha256Hex = sha256Hex
        )

        return ValidationResult.Success(snapshot, sha256Hex)
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseAcademic(map: Map<String, Any?>): SnapshotAcademic? {
        val importedAt = map["importedAt"] as? String
        val semester = map["semester"] as? String

        val attendanceMap = map["attendance"] as? Map<String, Any?>
        val attendance = if (attendanceMap != null) {
            SnapshotAttendance(
                combined = parseAttendanceCounts(attendanceMap["combined"] as? Map<String, Any?>),
                nst = parseAttendanceCounts(attendanceMap["nst"] as? Map<String, Any?>),
                rufp = parseAttendanceCounts(attendanceMap["rufp"] as? Map<String, Any?>)
            )
        } else null

        val rawSubjects = map["subjects"] as? List<Any?> ?: emptyList()
        if (rawSubjects.size > MAX_SUBJECTS) return null
        val subjects = rawSubjects.take(MAX_SUBJECTS).mapNotNull {
            val item = it as? Map<String, Any?> ?: return@mapNotNull null
            val name = (item["name"] as? String ?: "").take(100)
            val group = (item["group"] as? String ?: "").take(60)
            val code = (item["code"] as? String ?: "").take(40)
            val attended = (item["attended"] as? Number)?.toInt()?.coerceAtLeast(0) ?: 0
            val total = (item["total"] as? Number)?.toInt()?.coerceAtLeast(0) ?: 0
            val absent = (item["absent"] as? Number)?.toInt()?.coerceAtLeast(0) ?: 0
            val percent = (item["percent"] as? Number)?.toFloat()?.coerceIn(0f, 100f) ?: 0f
            val canMiss = (item["canMiss"] as? Number)?.toInt()?.coerceAtLeast(0) ?: 0
            val needAttend = (item["needAttend"] as? Number)?.toInt()?.coerceAtLeast(0) ?: 0
            SnapshotSubject(name, group, code, attended, total, absent, percent, canMiss, needAttend)
        }

        val rawSchedule = map["schedule"] as? List<Any?> ?: emptyList()
        if (rawSchedule.size > MAX_SCHEDULE_DAYS) return null
        val schedule = rawSchedule.take(MAX_SCHEDULE_DAYS).mapNotNull {
            val day = it as? Map<String, Any?> ?: return@mapNotNull null
            val date = (day["date"] as? String ?: "").take(48)
            val badge = (day["badge"] as? String ?: "").take(60)
            val rawItems = day["items"] as? List<Any?> ?: emptyList()
            if (rawItems.size > MAX_SCHEDULE_ITEMS_PER_DAY) return null
            val items = rawItems.take(MAX_SCHEDULE_ITEMS_PER_DAY).mapNotNull { rawItem ->
                val item = rawItem as? Map<String, Any?> ?: return@mapNotNull null
                SnapshotScheduleItem(
                    time = (item["time"] as? String ?: "").take(48),
                    subject = (item["subject"] as? String ?: "").take(100),
                    type = (item["type"] as? String ?: "").take(48),
                    title = (item["title"] as? String ?: "").take(140),
                    status = (item["status"] as? String ?: "").take(48),
                    location = (item["location"] as? String ?: "").take(100)
                )
            }
            SnapshotScheduleDay(date, badge, items)
        }

        val rawEmails = map["emails"] as? List<Any?> ?: emptyList()
        if (rawEmails.size > MAX_EMAILS) return null
        val emails = rawEmails.take(MAX_EMAILS).mapNotNull {
            val mail = it as? Map<String, Any?> ?: return@mapNotNull null
            SnapshotEmail(
                sender = (mail["sender"] as? String ?: "").take(100),
                subject = (mail["subject"] as? String ?: "").take(180),
                summary = (mail["summary"] as? String ?: "").take(220),
                date = (mail["date"] as? String ?: "").take(48),
                category = (mail["category"] as? String ?: "").take(48),
                priority = (mail["priority"] as? String ?: "").take(24),
                actionItem = (mail["actionItem"] as? String)?.take(180)
            )
        }

        return SnapshotAcademic(importedAt, semester, attendance, subjects, schedule, emails)
    }

    private fun parseAttendanceCounts(map: Map<String, Any?>?): SnapshotAttendanceCounts? {
        if (map == null) return null
        val attended = (map["attended"] as? Number)?.toInt()?.coerceAtLeast(0) ?: 0
        val total = (map["total"] as? Number)?.toInt()?.coerceAtLeast(0) ?: 0
        val percent = (map["percent"] as? Number)?.toFloat()?.coerceIn(0f, 100f) ?: 0f
        val canMiss = (map["canMiss"] as? Number)?.toInt()?.coerceAtLeast(0) ?: 0
        val needAttend = (map["needAttend"] as? Number)?.toInt()?.coerceAtLeast(0) ?: 0
        return SnapshotAttendanceCounts(attended, total, percent, canMiss, needAttend)
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseRadar(map: Map<String, Any?>): SnapshotRadar? {
        val fetchedAt = map["fetchedAt"] as? String
        val rawOpps = map["opportunities"] as? List<Any?> ?: emptyList()
        if (rawOpps.size > MAX_RADAR_OPPORTUNITIES) return null
        val opportunities = rawOpps.take(MAX_RADAR_OPPORTUNITIES).mapNotNull {
            val opp = it as? Map<String, Any?> ?: return@mapNotNull null
            val id = (opp["id"] as? String ?: "").take(100)
            if (id.isBlank()) return null
            val title = (opp["title"] as? String ?: "").take(180)
            val organizer = (opp["organizer"] as? String ?: "").take(120)
            val platform = (opp["platform"] as? String ?: "").take(40)
            val url = (opp["event_url"] as? String ?: opp["eventUrl"] as? String ?: "").take(500)
            val mode = (opp["mode"] as? String ?: "").take(40)
            val location = (opp["location"] as? String ?: "").take(120)
            val locationLabel = (opp["locationLabel"] as? String ?: "").take(120)
            val areaScope = (opp["areaScope"] as? String ?: "remote").take(40)
            val distanceKm = (opp["distanceKm"] as? Number)?.toDouble()
            val prizePool = (opp["prizePool"] as? String ?: opp["prize_pool"] as? String ?: "").take(100)
            val teamSize = (opp["teamSize"] as? String)?.take(60)

            val analysis = opp["analysis"] as? Map<String, Any?>
            val tier = (analysis?.get("tierKey") as? String
                ?: (analysis?.get("tier") as? String)?.removePrefix("Tier ")
                ?: (opp["tier"] as? String)
                ?: "B").take(1)
            val rawDifficulty = (analysis?.get("difficulty") as? String
                ?: opp["difficulty"] as? String ?: "unverified").take(20)
            val difficulty = if (rawDifficulty == "unknown") "unverified" else rawDifficulty
            val effortHours = (analysis?.get("effortHours") as? String)?.take(40)
            val confidence = (analysis?.get("confidence") as? String)?.take(20)

            val details = opp["details"] as? Map<String, Any?>
            val description = (details?.get("description") as? String ?: opp["description"] as? String)?.take(1000)
            val summary = (opp["summary"] as? String)?.take(500)

            val rawSkills = (opp["skills_required"] as? List<Any?> ?: opp["skills"] as? List<Any?>) ?: emptyList()
            val skills = rawSkills.take(MAX_RADAR_SKILLS).mapNotNull { s -> (s as? String)?.take(40) }

            SnapshotRadarOpportunity(
                id = id,
                title = title,
                organizer = organizer,
                platform = platform,
                eventUrl = url,
                mode = mode,
                location = location,
                locationLabel = locationLabel,
                areaScope = areaScope,
                distanceKm = distanceKm,
                startDate = opp["startDate"] as? String,
                endDate = opp["endDate"] as? String,
                registrationDeadline = (opp["registration_deadline"] as? String ?: opp["registrationDeadline"] as? String)?.take(48),
                prizePool = prizePool,
                teamSize = teamSize,
                tier = tier,
                difficulty = difficulty,
                effortHours = effortHours,
                confidence = confidence,
                summary = summary,
                description = description,
                skills = skills
            )
        }
        return SnapshotRadar(fetchedAt, opportunities)
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseMenu(map: Map<String, Any?>): SnapshotMenu? {
        val fetchedAt = map["fetchedAt"] as? String
        val rawMenu = map["menu"] as? Map<String, Any?> ?: emptyMap()
        val days = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
        val meals = listOf("breakfast", "lunch", "snacks", "dinner")

        val menu = mutableMapOf<String, Map<String, List<String>>>()
        for (day in days) {
            val dayMap = rawMenu[day] as? Map<String, Any?> ?: return null
            val dayMeals = mutableMapOf<String, List<String>>()
            for (meal in meals) {
                val rawItems = dayMap[meal] as? List<Any?> ?: return null
                if (rawItems.size > MAX_MEAL_ITEMS) return null
                dayMeals[meal] = rawItems.take(MAX_MEAL_ITEMS).mapNotNull { (it as? String)?.take(100) }
            }
            menu[day] = dayMeals
        }
        return SnapshotMenu(fetchedAt, menu)
    }
}
