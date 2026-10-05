package com.example.uthjabsdk.core.model

/**
 * Domain and UI models for Uth ja BSDK Android application.
 */

data class RoutineTask(
    val id: String,
    val title: String,
    val start: Int, // Minute of day (0-1439)
    val end: Int,   // Minute of day (0-1439)
    val trigger: Int = start,
    val kind: String, // "routine", "wake", "study", "packing", "meal", "class", "contest", "quiet", "choice", "swim", "sleep", "laundry"
    val detail: String,
    val room: String? = null,
    val source: String? = null,
    val guided: Boolean = false,
    val hidden: Boolean = false,
    val date: String? = null // YYYY-MM-DD if date specific
)

data class TaskRecord(
    val at: String,
    val recordedAt: String,
    val status: String = "done", // "done", "present", "absent", "excused"
    val verification: String = "manual"
)

data class FoodEntry(
    val id: String,
    val meal: String,
    val item: String,
    val amount: String? = null,
    val at: String
)

data class WardrobeItem(
    val id: String,
    val name: String,
    val status: String = "Clean", // "Clean", "Wearing", "Laundry"
    val photoUrl: String? = null
)

data class StudyNote(
    val id: String,
    val subject: String,
    val text: String,
    val date: String,
    val done: Boolean = false,
    val photoUrl: String? = null
)

data class LaundryRecord(
    val dropDate: String,
    val dueDate: String,
    val collectedAt: String? = null
)

data class CourseAttendance(
    val name: String,
    val code: String,
    val group: String, // "NST Core" or "RUFP Foundation"
    val attended: Int,
    val total: Int,
    val percent: Float,
    val canMiss: Int? = null,
    val needAttend: Int? = null
)

data class AttendanceGroupSummary(
    val attended: Int,
    val total: Int,
    val percent: Float
)

data class AcademicSummary(
    val semester: String = "Semester 1",
    val importedAt: String? = null,
    val combined: AttendanceGroupSummary = AttendanceGroupSummary(69, 84, 82.1f),
    val nst: AttendanceGroupSummary = AttendanceGroupSummary(53, 62, 85.5f),
    val rufp: AttendanceGroupSummary = AttendanceGroupSummary(16, 22, 72.7f),
    val contestXp: Int = 4858
)

data class AcademicClass(
    val source: String, // "NST" or "RUFP"
    val title: String,
    val time: String,
    val location: String,
    val start: Int,
    val topic: String? = null,
    val dateKey: String = ""
)

data class WeeklyTimetableDay(
    val key: String, // YYYY-MM-DD
    val badge: String, // "Past", "Today", "Upcoming"
    val label: String,
    val items: List<AcademicClass>
)

data class AcademicMailItem(
    val id: String,
    val subject: String,
    val sender: String,
    val date: String,
    val snippet: String,
    val category: String = "Official",
    val priority: String? = null, // "urgent", "high", "normal"
    val actionItem: String? = null
)

data class RadarOpportunity(
    val id: String,
    val title: String,
    val organizer: String,
    val platform: String, // "Unstop", "Devpost"
    val areaScope: String = "nearby", // "nearby", "local", "remote"
    val location: String,
    val distanceKm: Int? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val registrationDeadline: String? = null,
    val prizePool: String? = null,
    val teamSize: String? = null,
    val tier: String = "S", // "S", "A", "B", "C", "D", "E"
    val difficulty: String = "easy", // "easy", "medium", "hard", "unverified"
    val description: String,
    val eventUrl: String,
    val effortHours: Int? = null,
    val confidence: String? = null,
    val saved: Boolean = false,
    val progress: String = "Not started" // "Not started", "Interested", "Registered", "Building", "Submitted", "Completed", "Not for me"
)

data class DayRecord(
    val date: String, // YYYY-MM-DD
    val done: Map<String, TaskRecord> = emptyMap(),
    val checks: List<Int> = emptyList(), // Bag packing checked indices (0..11)
    val waterMl: Int = 0,
    val mode: String? = null, // "guided", "custom"
    val attendance: Map<String, String> = emptyMap(), // taskId -> "present" / "absent" / "excused"
    val scores: Map<String, Float> = emptyMap(), // taskId -> float percentage
    val snoozes: Map<String, Long> = emptyMap(),
    val alerted: Map<String, Long> = emptyMap(),
    val swimChecks: List<Int> = emptyList(), // Swimming checklist indices
    val foodEntries: List<FoodEntry> = emptyList(),
    val laundry: LaundryRecord? = null
)

data class DailyEventLog(
    val id: String,
    val timestamp: String,
    val effectiveTime: String,
    val type: String, // "done", "undo", "water_added", "present", "absent", etc.
    val taskId: String? = null,
    val title: String? = null,
    val verification: String? = null
)

enum class SyncSourceStateStatus {
    WAITING,
    RUNNING,
    SUCCESS,
    PARTIAL,
    SETUP_REQUIRED,
    FAILED
}

data class SyncSourceState(
    val name: String,
    val label: String,
    val status: SyncSourceStateStatus,
    val message: String? = null
)

enum class SyncOverallState {
    IDLE,
    RUNNING,
    SUCCESS,
    PARTIAL,
    ERROR
}

data class SyncStatus(
    val overallState: SyncOverallState = SyncOverallState.IDLE,
    val isRunning: Boolean = false,
    val lastSyncTime: String? = "25 Sept 2026, 2:23 am",
    val revision: String? = "rev-001",
    val sources: Map<String, SyncSourceState> = mapOf(
        "newton" to SyncSourceState("newton", "NST attendance", SyncSourceStateStatus.SUCCESS, "Snapshot committed"),
        "rishiverse" to SyncSourceState("rishiverse", "RUFP attendance", SyncSourceStateStatus.SUCCESS, "Snapshot committed"),
        "gmail" to SyncSourceState("gmail", "Academic mail", SyncSourceStateStatus.SUCCESS, "1 stored notice"),
        "radar" to SyncSourceState("radar", "Opportunity Radar", SyncSourceStateStatus.SUCCESS, "Unstop & Devpost verified")
    ),
    val errorMessage: String? = null
)
