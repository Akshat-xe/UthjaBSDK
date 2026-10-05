package com.example.uthjabsdk.core.sync

/**
 * Validated SnapshotV1 domain representations matching the backend projection specification.
 */
data class SnapshotV1(
    val schemaVersion: Int,
    val revision: String,
    val runId: String,
    val publishedAt: String,
    val sources: Map<String, SnapshotSource>,
    val academic: SnapshotAcademic,
    val radar: SnapshotRadar,
    val menu: SnapshotMenu,
    val sha256Hex: String = ""
)

data class SnapshotSource(
    val status: String,
    val freshness: String,
    val updatedAt: String? = null
)

data class SnapshotAcademic(
    val importedAt: String? = null,
    val semester: String? = null,
    val attendance: SnapshotAttendance? = null,
    val subjects: List<SnapshotSubject> = emptyList(),
    val schedule: List<SnapshotScheduleDay> = emptyList(),
    val emails: List<SnapshotEmail> = emptyList()
)

data class SnapshotAttendance(
    val combined: SnapshotAttendanceCounts? = null,
    val nst: SnapshotAttendanceCounts? = null,
    val rufp: SnapshotAttendanceCounts? = null
)

data class SnapshotAttendanceCounts(
    val attended: Int = 0,
    val total: Int = 0,
    val percent: Float = 0f,
    val canMiss: Int = 0,
    val needAttend: Int = 0
)

data class SnapshotSubject(
    val name: String,
    val group: String,
    val code: String,
    val attended: Int = 0,
    val total: Int = 0,
    val absent: Int = 0,
    val percent: Float = 0f,
    val canMiss: Int = 0,
    val needAttend: Int = 0
)

data class SnapshotScheduleDay(
    val date: String,
    val badge: String,
    val items: List<SnapshotScheduleItem> = emptyList()
)

data class SnapshotScheduleItem(
    val time: String,
    val subject: String,
    val type: String,
    val title: String,
    val status: String,
    val location: String
)

data class SnapshotEmail(
    val sender: String,
    val subject: String,
    val summary: String,
    val date: String,
    val category: String,
    val priority: String,
    val actionItem: String? = null
)

data class SnapshotRadar(
    val fetchedAt: String? = null,
    val opportunities: List<SnapshotRadarOpportunity> = emptyList()
)

data class SnapshotRadarOpportunity(
    val id: String,
    val title: String,
    val organizer: String,
    val platform: String,
    val eventUrl: String,
    val mode: String = "",
    val location: String = "",
    val locationLabel: String = "",
    val areaScope: String = "remote",
    val distanceKm: Double? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val registrationDeadline: String? = null,
    val prizePool: String = "",
    val teamSize: String? = null,
    val tier: String = "B",
    val difficulty: String = "medium",
    val effortHours: String? = null,
    val confidence: String? = null,
    val summary: String? = null,
    val description: String? = null,
    val skills: List<String> = emptyList()
)

data class SnapshotMenu(
    val fetchedAt: String? = null,
    val menu: Map<String, Map<String, List<String>>> = emptyMap()
)
