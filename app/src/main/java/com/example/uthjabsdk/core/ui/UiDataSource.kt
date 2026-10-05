package com.example.uthjabsdk.core.ui

import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.AcademicMailItem
import com.example.uthjabsdk.core.model.AcademicSummary
import com.example.uthjabsdk.core.model.CourseAttendance
import com.example.uthjabsdk.core.model.DailyEventLog
import com.example.uthjabsdk.core.model.DayRecord
import com.example.uthjabsdk.core.model.FoodEntry
import com.example.uthjabsdk.core.model.LaundryRecord
import com.example.uthjabsdk.core.model.RadarOpportunity
import com.example.uthjabsdk.core.model.RoutineTask
import com.example.uthjabsdk.core.model.StudyNote
import com.example.uthjabsdk.core.model.SyncOverallState
import com.example.uthjabsdk.core.model.SyncSourceState
import com.example.uthjabsdk.core.model.SyncSourceStateStatus
import com.example.uthjabsdk.core.model.SyncStatus
import com.example.uthjabsdk.core.model.TaskRecord
import com.example.uthjabsdk.core.model.WardrobeItem
import com.example.uthjabsdk.core.model.WeeklyTimetableDay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * UthJaBsdkDataSource: The typed contract for Uth ja BSDK Android UI.
 *
 * NOTE FOR CODEX (PART 1 WORKER):
 * Implement this interface when attaching the real authenticated Convex manual sync and
 * local encrypted/offline storage layer.
 *
 * Requirements:
 * 1. UI observes StateFlows for reactive Compose rendering.
 * 2. triggerSync() calls your manual sync executor.
 * 3. Local phone actions (checkoffs, water, notes, food, wardrobe) must be preserved locally.
 * 4. syncState must accurately reflect the snapshot status and never simulate artificial success.
 */
interface UthJaBsdkDataSource {
    // Observable UI State
    val currentDate: StateFlow<String>
    val currentDay: StateFlow<DayRecord>
    val allDays: StateFlow<Map<String, DayRecord>>
    val tasksRevision: StateFlow<Int>
    val syncState: StateFlow<SyncStatus>
    val alarmsEnabled: StateFlow<Boolean>
    val studyNotes: StateFlow<List<StudyNote>>
    val wardrobe: StateFlow<List<WardrobeItem>>
    val radarItems: StateFlow<List<RadarOpportunity>>
    val academicSummary: StateFlow<AcademicSummary>
    val courseAttendances: StateFlow<List<CourseAttendance>>
    val weeklyClasses: StateFlow<List<AcademicClass>>
    val academicMails: StateFlow<List<AcademicMailItem>>
    val mealMenu: StateFlow<Map<String, Map<String, List<String>>>>
    val eventLogs: StateFlow<List<DailyEventLog>>
    val dailyQuote: StateFlow<Pair<String, String>> // Quote to Author

    // Query Methods
    fun getTasksForDate(dateKey: String): List<RoutineTask>
    fun getWeeklyTimetable(selectedDate: String): List<WeeklyTimetableDay>
    fun canCompleteTask(task: RoutineTask, dateKey: String, nowTime: LocalTime): Boolean

    // User Actions
    fun setDate(dateKey: String)
    fun toggleAlarms()
    fun triggerSync()
    fun completeTask(task: RoutineTask, status: String = "done", verification: String = "manual")
    fun undoTask(task: RoutineTask)
    fun saveCustomTask(task: RoutineTask)
    fun togglePackingCheck(index: Int)
    fun addWater(ml: Int)
    fun undoWater(previousMl: Int)
    fun addFoodEntry(meal: String, item: String, amount: String?)
    fun removeFoodEntry(id: String)
    fun logLaundryDrop()
    fun collectLaundry(dropDate: String)
    fun addWardrobeItem(name: String, photoUrl: String?)
    fun setWardrobeStatus(id: String, status: String)
    fun toggleSwimCheck(index: Int)
    fun addStudyNote(subject: String, text: String, photoUrl: String?)
    fun toggleStudyNote(id: String)
    fun setEveningMode(mode: String) // "guided" or "custom"
    fun saveContestScore(taskId: String, score: Float)
    fun toggleRadarFavorite(id: String)
    fun setRadarProgress(id: String, progress: String)
    fun exportPhoneActions(): String?
}

/**
 * FakeUiDataSource: Complete in-memory implementation seeded with the full website dataset.
 */
class FakeUiDataSource(
    private val onSyncRequested: () -> Unit = {}
) : UthJaBsdkDataSource {

    override fun exportPhoneActions(): String? = null

    companion object {
        const val SEMESTER_START = "2026-08-15"
        const val SEMESTER_END = "2027-02-14"
        const val CONTEST_ANCHOR = "2026-09-18"

        val PACKING_ITEMS = listOf(
            "Phone charger",
            "MacBook Air M5",
            "Phone",
            "PSP",
            "Book",
            "Rough copy",
            "Pen",
            "Earbuds",
            "ID card",
            "SSD card",
            "Room key",
            "Lock the door"
        )

        val SWIM_ITEMS = listOf(
            "Towel",
            "Swimming goggles",
            "Swim cap",
            "Swimming pants",
            "Lock the door"
        )
    }

    private val _currentDate = MutableStateFlow("2026-09-25")
    override val currentDate: StateFlow<String> = _currentDate.asStateFlow()

    private val _daysMap = MutableStateFlow<Map<String, DayRecord>>(emptyMap())
    override val allDays: StateFlow<Map<String, DayRecord>> = _daysMap.asStateFlow()

    private val _currentDay = MutableStateFlow(DayRecord(date = _currentDate.value))
    override val currentDay: StateFlow<DayRecord> = _currentDay.asStateFlow()

    private val _syncState = MutableStateFlow(
        SyncStatus(
            overallState = SyncOverallState.IDLE,
            isRunning = false,
            lastSyncTime = "25 Sept 2026, 2:23 am",
            revision = "rev-001",
            sources = mapOf(
                "newton" to SyncSourceState("newton", "NST attendance", SyncSourceStateStatus.SUCCESS, "Snapshot committed"),
                "rishiverse" to SyncSourceState("rishiverse", "RUFP attendance", SyncSourceStateStatus.SUCCESS, "Snapshot committed"),
                "gmail" to SyncSourceState("gmail", "Academic mail", SyncSourceStateStatus.SUCCESS, "3 stored notices"),
                "radar" to SyncSourceState("radar", "Opportunity Radar", SyncSourceStateStatus.SUCCESS, "Unstop & Devpost verified")
            )
        )
    )
    override val syncState: StateFlow<SyncStatus> = _syncState.asStateFlow()

    private val _alarmsEnabled = MutableStateFlow(false)
    override val alarmsEnabled: StateFlow<Boolean> = _alarmsEnabled.asStateFlow()

    private val _tasksRevision = MutableStateFlow(0)
    override val tasksRevision: StateFlow<Int> = _tasksRevision.asStateFlow()

    private val _studyNotes = MutableStateFlow<List<StudyNote>>(emptyList())
    override val studyNotes: StateFlow<List<StudyNote>> = _studyNotes.asStateFlow()

    private val _wardrobe = MutableStateFlow<List<WardrobeItem>>(emptyList())
    override val wardrobe: StateFlow<List<WardrobeItem>> = _wardrobe.asStateFlow()

    private val _radarItems = MutableStateFlow<List<RadarOpportunity>>(emptyList())
    override val radarItems: StateFlow<List<RadarOpportunity>> = _radarItems.asStateFlow()

    private val _academicSummary = MutableStateFlow(AcademicSummary())
    override val academicSummary: StateFlow<AcademicSummary> = _academicSummary.asStateFlow()

    private val _courseAttendances = MutableStateFlow<List<CourseAttendance>>(emptyList())
    override val courseAttendances: StateFlow<List<CourseAttendance>> = _courseAttendances.asStateFlow()

    private val _weeklyClasses = MutableStateFlow<List<AcademicClass>>(emptyList())
    override val weeklyClasses: StateFlow<List<AcademicClass>> = _weeklyClasses.asStateFlow()

    private val _academicMails = MutableStateFlow<List<AcademicMailItem>>(emptyList())
    override val academicMails: StateFlow<List<AcademicMailItem>> = _academicMails.asStateFlow()

    private val _mealMenu = MutableStateFlow<Map<String, Map<String, List<String>>>>(emptyMap())
    override val mealMenu: StateFlow<Map<String, Map<String, List<String>>>> = _mealMenu.asStateFlow()

    private val _eventLogs = MutableStateFlow<List<DailyEventLog>>(emptyList())
    override val eventLogs: StateFlow<List<DailyEventLog>> = _eventLogs.asStateFlow()

    private val _dailyQuote = MutableStateFlow(
        "Make one useful thing a little better today." to "Akshat’s Daily Rhythm"
    )
    override val dailyQuote: StateFlow<Pair<String, String>> = _dailyQuote.asStateFlow()

    private val customTasks = mutableListOf<RoutineTask>()

    init {
        seedInitialData()
    }

    private fun seedInitialData() {
        // Study notes
        _studyNotes.value = listOf(
            StudyNote(
                id = UUID.randomUUID().toString(),
                subject = "Problem solving & programming",
                text = "Complete dynamic programming assignment before Friday midnight.",
                date = "2026-09-24",
                done = false
            ),
            StudyNote(
                id = UUID.randomUUID().toString(),
                subject = "Systems & AI",
                text = "Read chapter 4 on vector spaces and embeddings for Lab 1.",
                date = "2026-09-23",
                done = true
            )
        )

        // Wardrobe
        _wardrobe.value = listOf(
            WardrobeItem("w1", "Navy Blue Hoodie", "Clean"),
            WardrobeItem("w2", "Black Cargo Pants", "Wearing"),
            WardrobeItem("w3", "Olive T-Shirt", "Clean"),
            WardrobeItem("w4", "Grey Sweatshirt", "Laundry"),
            WardrobeItem("w5", "White Sneakers", "Clean")
        )

        // Course attendances
        _courseAttendances.value = listOf(
            CourseAttendance("Maths I - D", "MATH101", "NST Core", 8, 10, 80f, canMiss = 0),
            CourseAttendance("PSP - D", "CS101", "NST Core", 11, 13, 84.6f, canMiss = 1),
            CourseAttendance("S&AI - D", "AI101", "NST Core", 9, 10, 90f, canMiss = 2),
            CourseAttendance("Maths I Lab 1 - D", "MATH101L", "NST Core", 9, 10, 90f, canMiss = 2),
            CourseAttendance("PSP Lab 1 - D", "CS101L", "NST Core", 9, 9, 100f, canMiss = 3),
            CourseAttendance("S&AI Lab 1 - D", "AI101L", "NST Core", 7, 10, 70f, needAttend = 2),
            CourseAttendance("Self and Society I", "RSPRFC1002", "RUFP Foundation", 2, 4, 50f, needAttend = 4),
            CourseAttendance("Social Communication I", "RSPRFC1003", "RUFP Foundation", 8, 10, 80f),
            CourseAttendance("Understanding India", "RSPRFC1001", "RUFP Foundation", 6, 8, 75f)
        )

        // Academic emails
        _academicMails.value = listOf(
            AcademicMailItem(
                id = "m1",
                subject = "Campus notice example",
                sender = "Campus office <office@example.edu>",
                date = "24 Sept 2026",
                snippet = "Example notice shown until your first laptop sync.",
                category = "Official",
                priority = "normal",
                actionItem = "Sync to load approved academic notices"
            ),
            AcademicMailItem(
                id = "m2",
                subject = "Mid-term Lab Assessments Schedule - Section D",
                sender = "Dean of Academics <academics@rishihood.edu.in>",
                date = "22 Sept 2026",
                snippet = "The schedule for Lab 1 assessments in Problem Solving and Systems & AI has been published.",
                category = "Academic",
                priority = "urgent",
                actionItem = "Verify room allocation in A305"
            ),
            AcademicMailItem(
                id = "m3",
                subject = "Smart India Hackathon 2026 Campus Round Registration",
                sender = "NST Hackathon Cell <events@newtonschool.co>",
                date = "20 Sept 2026",
                snippet = "Form teams of 6 with at least one female teammate. Campus triage closes this Sunday.",
                category = "Opportunities",
                priority = "high",
                actionItem = "Submit team roster by Sunday 5:00 PM"
            )
        )

        // Campus meal menu
        val meals = mapOf(
            "breakfast" to listOf("Aloo Paratha", "Curd & Pickle", "Sprouts", "Tea & Coffee"),
            "lunch" to listOf("Dal Makhani", "Jeera Rice", "Paneer Lababdar", "Tandoori Roti", "Salad"),
            "snacks" to listOf("Vegetable Cutlet", "Mint Chutney", "Hot Milk & Coffee"),
            "dinner" to listOf("Yellow Dal Tadka", "Steamed Basmati Rice", "Aloo Gobhi", "Chapati", "Gulab Jamun")
        )
        val fullWeekMenu = mutableMapOf<String, Map<String, List<String>>>()
        listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday").forEach {
            fullWeekMenu[it] = meals
        }
        _mealMenu.value = fullWeekMenu

        // Radar opportunities
        _radarItems.value = listOf(
            RadarOpportunity(
                id = "rad-1",
                title = "Smart India Hackathon 2026 - Hardware & Software",
                organizer = "Ministry of Education & AICTE",
                platform = "Unstop",
                areaScope = "nearby",
                location = "New Delhi / NCR · ~45 km straight-line from Sonipat",
                distanceKm = 45,
                startDate = "2026-10-15",
                endDate = "2026-10-17",
                registrationDeadline = "2026-10-05",
                prizePool = "₹1,00,000 per problem statement",
                teamSize = "6 people",
                tier = "S",
                difficulty = "medium",
                description = "Nationwide hackathon solving challenges in smart governance, healthcare, and education.",
                eventUrl = "https://unstop.com",
                effortHours = 36,
                confidence = "High",
                saved = true,
                progress = "Registered"
            ),
            RadarOpportunity(
                id = "rad-2",
                title = "Google Developer Student Solution Challenge 2026",
                organizer = "Google Developer Groups",
                platform = "Devpost",
                areaScope = "remote",
                location = "Online · open anywhere",
                startDate = "2026-10-01",
                endDate = "2026-12-01",
                registrationDeadline = "2026-10-20",
                prizePool = "₹25,00,000 total · Mentorship from Google",
                teamSize = "1–4 people",
                tier = "S",
                difficulty = "easy",
                description = "Build a solution using Google technology addressing one of the 17 UN Sustainable Development Goals.",
                eventUrl = "https://devpost.com",
                effortHours = 40,
                confidence = "High",
                saved = false,
                progress = "Not started"
            ),
            RadarOpportunity(
                id = "rad-3",
                title = "DevHacks Delhi NCR 2026",
                organizer = "TechDelhi Community",
                platform = "Unstop",
                areaScope = "local",
                location = "Gurugram · ~60 km from Sonipat",
                distanceKm = 60,
                startDate = "2026-11-08",
                endDate = "2026-11-09",
                registrationDeadline = "2026-10-25",
                prizePool = "₹1,50,000 total",
                teamSize = "2–4 people",
                tier = "A",
                difficulty = "easy",
                description = "24-hour in-person hackathon focused on developer tooling, WebAssembly, and local agent workflows.",
                eventUrl = "https://unstop.com",
                effortHours = 24,
                confidence = "Medium",
                saved = true,
                progress = "Interested"
            ),
            RadarOpportunity(
                id = "rad-4",
                title = "Sonipat Code Sprint & Builders Meet",
                organizer = "Rishihood University Innovation Hub",
                platform = "Unstop",
                areaScope = "nearby",
                location = "Sonipat Campus · Main Auditorium",
                distanceKm = 0,
                startDate = "2026-10-10",
                endDate = "2026-10-10",
                registrationDeadline = "2026-10-08",
                prizePool = "₹50,000 + Incubation Support",
                teamSize = "1–3 people",
                tier = "A",
                difficulty = "easy",
                description = "Internal sprint to prototype solutions for campus life, attendance, and student productivity.",
                eventUrl = "https://unstop.com",
                effortHours = 12,
                confidence = "High",
                saved = false,
                progress = "Building"
            )
        )

        // Seed current day record
        val initialDay = DayRecord(
            date = _currentDate.value,
            waterMl = 750,
            checks = listOf(0, 1, 2, 4),
            laundry = LaundryRecord(
                dropDate = "2026-09-21",
                dueDate = "2026-09-24",
                collectedAt = "2026-09-24T17:15:00"
            )
        )
        _daysMap.value = mapOf(_currentDate.value to initialDay)
        _currentDay.value = initialDay
    }

    override fun setDate(dateKey: String) {
        _currentDate.value = dateKey
        val map = _daysMap.value
        val day = map[dateKey] ?: DayRecord(date = dateKey)
        _currentDay.value = day
    }

    override fun toggleAlarms() {
        _alarmsEnabled.value = !_alarmsEnabled.value
    }

    override fun triggerSync() {
        // Must NEVER fake data; call injected callback for Codex integration and update status
        _syncState.value = _syncState.value.copy(
            isRunning = true,
            overallState = SyncOverallState.RUNNING
        )
        onSyncRequested()
    }

    fun updateSyncStateFromBackend(status: SyncStatus) {
        _syncState.value = status
    }

    override fun getTasksForDate(dateKey: String): List<RoutineTask> {
        val date = try {
            LocalDate.parse(dateKey)
        } catch (_: Exception) {
            LocalDate.parse("2026-09-25")
        }
        val dayOfWeek = date.dayOfWeek.value // 1 (Mon) to 7 (Sun)

        val list = mutableListOf<RoutineTask>()

        // 1. Wake
        list.add(
            RoutineTask(
                id = "wake",
                title = "Wake up. Start fresh.",
                start = 295, // 4:55 AM
                end = 305,   // 5:05 AM
                kind = "wake",
                detail = "Drink hot water, put your phone on charge, and begin your morning."
            )
        )

        // 2. Freshen
        list.add(
            RoutineTask(
                id = "freshen",
                title = "Brush, freshen up & shower",
                start = 305, // 5:05 AM
                end = 345,   // 5:45 AM
                kind = "routine",
                detail = "Brush your teeth, use the bathroom, shower and change. Morning facial routine: besan cleanse and coconut oil."
            )
        )

        // 3. Morning study
        list.add(
            RoutineTask(
                id = "morning-study",
                title = "A quiet start",
                start = 345, // 5:45 AM
                end = 480,   // 8:00 AM
                kind = "study",
                detail = "Review yesterday’s notes, practise programming and get ready without rushing."
            )
        )

        // 4. Packing
        list.add(
            RoutineTask(
                id = "packing",
                title = "Pack your bag",
                start = 485, // 8:05 AM
                end = 505,   // 8:25 AM
                kind = "packing",
                detail = "Everything you need, checked once. Take your room key and lock the door."
            )
        )

        // 5. Breakfast
        list.add(
            RoutineTask(
                id = "breakfast",
                title = "Breakfast",
                start = 505, // 8:25 AM
                end = 510,   // 8:30 AM
                kind = "meal",
                detail = "Head to the Newton School mess. Your bag should already be packed."
            )
        )

        // Classes for date based on day of week
        val classes = getClassesForDate(dateKey, dayOfWeek)
        if (classes.isNotEmpty()) {
            list.add(
                RoutineTask(
                    id = "leave",
                    title = "Leave for campus",
                    start = 510, // 8:30 AM
                    end = 520,   // 8:40 AM
                    kind = "routine",
                    detail = "Leave the mess and head to campus. Check your first class and room below."
                )
            )
            list.addAll(classes)
        }

        // Lunch
        list.add(
            RoutineTask(
                id = "lunch",
                title = "Lunch & water",
                start = 780, // 1:00 PM
                end = 831,   // 1:51 PM
                kind = "meal",
                detail = "Have lunch, refill your water bottle and check the next classroom."
            )
        )

        // Cooldown / Quiet Hour
        list.add(
            RoutineTask(
                id = "cooldown",
                title = "Your quiet hour",
                start = 1020, // 5:00 PM
                end = 1080,   // 6:00 PM
                kind = "quiet",
                detail = "No reminders from 5:00–6:00 PM. Have your snacks and take a breather."
            )
        )

        // Evening choice
        list.add(
            RoutineTask(
                id = "evening",
                title = "Choose your evening",
                start = 1080, // 6:00 PM
                end = 1095,   // 6:15 PM
                kind = "choice",
                detail = "How was your day? Had your snacks? Choose Guided or Custom until 11:00 PM."
            )
        )

        // Study session 1
        val study1End = if (dayOfWeek in listOf(1, 3, 5)) 1170 else 1200 // 7:30 PM vs 8:00 PM
        list.add(
            RoutineTask(
                id = "study-one",
                title = "Study · first session",
                start = 1095, // 6:15 PM
                end = study1End,
                kind = "study",
                detail = "Go to your room, plug your phone in and start with your homework.",
                guided = true
            )
        )

        // Swimming on Mon, Wed, Fri
        if (dayOfWeek in listOf(1, 3, 5)) {
            list.add(
                RoutineTask(
                    id = "swim",
                    title = "Swimming",
                    start = 1170, // 7:30 PM
                    end = 1215,   // 8:15 PM
                    kind = "swim",
                    detail = "Take swimwear, towel, goggles, room key and a clean change. Head downstairs using the lift or stairs carefully.",
                    guided = true
                )
            )
        }

        // Study session 2
        list.add(
            RoutineTask(
                id = "study-two",
                title = "Study · finish strong",
                start = 1215, // 8:15 PM
                end = 1380,   // 11:00 PM
                kind = "study",
                detail = "Work through homework and prepare for the next class. Take dinner within the 8:00–9:30 PM window.",
                guided = true
            )
        )

        // Sleep
        list.add(
            RoutineTask(
                id = "sleep",
                title = "Time to sleep",
                start = 1380, // 11:00 PM
                end = 1440,   // 12:00 AM
                kind = "sleep",
                detail = "Put your phone away. Your next wake-up is 4:55 AM — a 5h 55m window."
            )
        )

        // Laundry drops/collections
        if (dayOfWeek == 1) { // Monday
            list.add(
                RoutineTask(
                    id = "laundry-drop",
                    title = "Drop off laundry",
                    start = 1010, // 4:50 PM
                    end = 1020,   // 5:00 PM
                    kind = "laundry",
                    detail = "Take the laundry bag and receipt. Monday drop-off → Thursday collection. Counter closes at 6:00 PM."
                )
            )
        }
        if (dayOfWeek == 4) { // Thursday
            list.add(
                RoutineTask(
                    id = "laundry-pick",
                    title = "Collect laundry",
                    start = 1010, // 4:50 PM
                    end = 1020,   // 5:00 PM
                    kind = "laundry",
                    detail = "Collect Monday’s laundry with your receipt. Return clean clothes to your wardrobe."
                )
            )
        }

        // Add custom tasks
        val customForDate = customTasks.filter { it.date == null || it.date == dateKey }
        list.addAll(customForDate)

        return list.sortedBy { it.start }
    }

    private fun getClassesForDate(dateKey: String, dayOfWeek: Int): List<RoutineTask> {
        val cls = { id: String, title: String, start: Int, end: Int, room: String ->
            RoutineTask(
                id = id,
                title = title,
                start = start,
                end = end,
                trigger = start - 9,
                kind = "class",
                detail = "Go to $room. Complete your campus facial attendance scan, then mark yourself present.",
                room = room,
                source = "PDF · page 4 · Section D / 4 / Lab 1"
            )
        }

        return when (dayOfWeek) {
            1 -> listOf(
                cls("systems-lab", "Systems & AI · Lab 1", 520, 600, "A305"),
                cls("communication", "Social Communication", 610, 670, "A509"),
                cls("programming-lab", "Problem solving · Lab 1", 840, 920, "A305"),
                cls("math-lab", "Mathematics I · Lab 1", 930, 1010, "A305")
            )
            2 -> listOf(
                cls("communication", "Social Communication", 610, 670, "A509"),
                cls("systems", "Systems & AI Essentials", 690, 770, "A507"),
                cls("programming", "Problem solving & programming", 840, 920, "A507"),
                cls("math", "Mathematics I", 930, 1010, "A507")
            )
            3 -> listOf(
                cls("systems-lab", "Systems & AI · Lab 1", 520, 600, "A305"),
                cls("society", "Self & Society", 610, 670, "Main Auditorium"),
                cls("programming-lab", "Problem solving · Lab 1", 840, 920, "A305"),
                cls("math-lab", "Mathematics I · Lab 1", 930, 1010, "A305")
            )
            4 -> listOf(
                cls("india", "Understanding India", 540, 670, "A509"),
                cls("systems", "Systems & AI Essentials", 690, 770, "A507"),
                cls("programming", "Problem solving & programming", 840, 920, "A507"),
                cls("math", "Mathematics I", 930, 1010, "A507")
            )
            5 -> {
                val contestSubject = getContestSubject(dateKey)
                listOf(
                    cls("india", "Understanding India", 540, 670, "A509"),
                    RoutineTask(
                        id = "contest",
                        title = "Contest · $contestSubject",
                        start = 840,
                        end = 990,
                        trigger = 831,
                        kind = "contest",
                        detail = "Go to Room to confirm. Complete self-reported contest score after finishing.",
                        room = "Room to confirm",
                        source = "PDF · page 4 · Section D / 4 / Lab 1"
                    )
                )
            }
            else -> emptyList()
        }
    }

    private fun getContestSubject(dateKey: String): String {
        val anchor = LocalDate.parse(CONTEST_ANCHOR)
        val current = try { LocalDate.parse(dateKey) } catch (_: Exception) { anchor }
        val days = java.time.temporal.ChronoUnit.DAYS.between(anchor, current)
        val weeks = (days / 7).toInt()
        val subjects = listOf("Problem solving & programming", "Mathematics I", "Systems & AI")
        val index = ((weeks % 3) + 3) % 3
        return subjects[index]
    }

    override fun canCompleteTask(task: RoutineTask, dateKey: String, nowTime: LocalTime): Boolean {
        val today = LocalDate.now().toString()
        if (dateKey < today) return true
        if (dateKey > today) return false
        val currentMinutes = nowTime.hour * 60 + nowTime.minute
        return currentMinutes >= task.trigger
    }

    override fun completeTask(task: RoutineTask, status: String, verification: String) {
        val key = _currentDate.value
        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val updatedDone = current.done.toMutableMap()
        updatedDone[task.id] = TaskRecord(
            at = java.time.Instant.now().toString(),
            recordedAt = java.time.Instant.now().toString(),
            status = status,
            verification = verification
        )

        val updatedAttendance = current.attendance.toMutableMap()
        if (task.kind in listOf("class", "contest")) {
            updatedAttendance[task.id] = if (status == "done") "present" else status
        }

        val updatedDay = current.copy(
            done = updatedDone,
            attendance = updatedAttendance
        )
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay

        logEvent(type = status, taskId = task.id, title = task.title, verification = verification)
    }

    override fun undoTask(task: RoutineTask) {
        val key = _currentDate.value
        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: return

        val updatedDone = current.done.toMutableMap()
        updatedDone.remove(task.id)

        val updatedAttendance = current.attendance.toMutableMap()
        updatedAttendance.remove(task.id)

        val updatedDay = current.copy(
            done = updatedDone,
            attendance = updatedAttendance
        )
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay

        logEvent(type = "undo", taskId = task.id, title = task.title)
    }

    override fun saveCustomTask(task: RoutineTask) {
        customTasks.add(task)
        _tasksRevision.value += 1
        // Refresh day
        val key = _currentDate.value
        _currentDay.value = _daysMap.value[key] ?: DayRecord(date = key)
    }

    override fun togglePackingCheck(index: Int) {
        val key = _currentDate.value
        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val checks = current.checks.toMutableList()
        if (checks.contains(index)) {
            checks.remove(index)
        } else {
            checks.add(index)
        }

        val updatedDay = current.copy(checks = checks)
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay
    }

    override fun addWater(ml: Int) {
        val key = _currentDate.value
        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val updatedDay = current.copy(waterMl = current.waterMl + ml)
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay

        logEvent(type = "water_added", taskId = "water", title = "+$ml ml water")
    }

    override fun undoWater(previousMl: Int) {
        val key = _currentDate.value
        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val updatedDay = current.copy(waterMl = previousMl)
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay

        logEvent(type = "water_undo", taskId = "water")
    }

    override fun addFoodEntry(meal: String, item: String, amount: String?) {
        val key = _currentDate.value
        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val entry = FoodEntry(
            id = UUID.randomUUID().toString(),
            meal = meal,
            item = item,
            amount = amount,
            at = java.time.Instant.now().toString()
        )

        val entries = current.foodEntries + entry
        val updatedDay = current.copy(foodEntries = entries)
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay

        logEvent(type = "food_logged", title = "$meal: $item")
    }

    override fun removeFoodEntry(id: String) {
        val key = _currentDate.value
        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: return

        val entries = current.foodEntries.filter { it.id != id }
        val updatedDay = current.copy(foodEntries = entries)
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay
    }

    override fun logLaundryDrop() {
        val key = _currentDate.value
        val date = try { LocalDate.parse(key) } catch (_: Exception) { LocalDate.now() }
        val dueDate = date.plusDays(3).toString()

        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)
        val updatedDay = current.copy(
            laundry = LaundryRecord(dropDate = key, dueDate = dueDate)
        )
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay

        logEvent(type = "laundry_drop", taskId = "laundry", title = "Laundry dropped off")
    }

    override fun collectLaundry(dropDate: String) {
        val map = _daysMap.value.toMutableMap()
        val current = map[dropDate] ?: return
        val laundry = current.laundry ?: return

        val updatedDay = current.copy(
            laundry = laundry.copy(collectedAt = java.time.Instant.now().toString())
        )
        map[dropDate] = updatedDay
        _daysMap.value = map
        if (_currentDate.value == dropDate) {
            _currentDay.value = updatedDay
        }

        logEvent(type = "laundry_collected", taskId = "laundry", title = "Laundry collected")
    }

    override fun addWardrobeItem(name: String, photoUrl: String?) {
        val item = WardrobeItem(
            id = UUID.randomUUID().toString(),
            name = name,
            status = "Clean",
            photoUrl = photoUrl
        )
        _wardrobe.value = _wardrobe.value + item
    }

    override fun setWardrobeStatus(id: String, status: String) {
        _wardrobe.value = _wardrobe.value.map {
            if (it.id == id) it.copy(status = status) else it
        }
    }

    override fun toggleSwimCheck(index: Int) {
        val key = _currentDate.value
        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val checks = current.swimChecks.toMutableList()
        if (checks.contains(index)) {
            checks.remove(index)
        } else {
            checks.add(index)
        }

        val updatedDay = current.copy(swimChecks = checks)
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay
    }

    override fun addStudyNote(subject: String, text: String, photoUrl: String?) {
        val note = StudyNote(
            id = UUID.randomUUID().toString(),
            subject = subject,
            text = text,
            date = _currentDate.value,
            done = false,
            photoUrl = photoUrl
        )
        _studyNotes.value = listOf(note) + _studyNotes.value
    }

    override fun toggleStudyNote(id: String) {
        _studyNotes.value = _studyNotes.value.map {
            if (it.id == id) it.copy(done = !it.done) else it
        }
    }

    override fun setEveningMode(mode: String) {
        val key = _currentDate.value
        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val updatedDay = current.copy(mode = mode)
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay

        logEvent(type = "evening_mode", taskId = "evening", title = "Evening: $mode")
    }

    override fun saveContestScore(taskId: String, score: Float) {
        val key = _currentDate.value
        val map = _daysMap.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val scores = current.scores.toMutableMap()
        scores[taskId] = score

        val updatedDay = current.copy(scores = scores)
        map[key] = updatedDay
        _daysMap.value = map
        _currentDay.value = updatedDay

        logEvent(type = "contest_score", taskId = taskId, title = "Score: $score%")
    }

    override fun toggleRadarFavorite(id: String) {
        _radarItems.value = _radarItems.value.map {
            if (it.id == id) it.copy(saved = !it.saved) else it
        }
    }

    override fun setRadarProgress(id: String, progress: String) {
        _radarItems.value = _radarItems.value.map {
            if (it.id == id) it.copy(progress = progress) else it
        }
    }

    override fun getWeeklyTimetable(selectedDate: String): List<WeeklyTimetableDay> {
        val date = try { LocalDate.parse(selectedDate) } catch (_: Exception) { LocalDate.now() }
        val monday = date.minusDays((date.dayOfWeek.value - 1).toLong())
        val todayStr = LocalDate.now().toString()

        return (0..4).map { offset ->
            val dayDate = monday.plusDays(offset.toLong())
            val dateStr = dayDate.toString()
            val classes = getClassesForDate(dateStr, offset + 1).map { task ->
                AcademicClass(
                    source = if (task.id in listOf("communication", "society", "india")) "RUFP" else "NST",
                    title = task.title,
                    time = "${formatMinutes(task.start)} – ${formatMinutes(task.end)}",
                    location = task.room ?: "",
                    start = task.start,
                    dateKey = dateStr
                )
            }
            val badge = if (dateStr == todayStr) "Today" else if (dateStr < todayStr) "Past" else "Upcoming"
            WeeklyTimetableDay(
                key = dateStr,
                badge = badge,
                label = "${dayDate.month.name.take(3)} ${dayDate.dayOfMonth} (${dayDate.dayOfWeek.name.lowercase().replaceFirstChar { it.uppercase() }})",
                items = classes
            )
        }
    }

    private fun formatMinutes(minutes: Int): String {
        val m = ((minutes % 1440) + 1440) % 1440
        val h = m / 60
        val min = m % 60
        val amPm = if (h >= 12) "PM" else "AM"
        val hour12 = if (h % 12 == 0) 12 else h % 12
        return "%d:%02d %s".format(hour12, min, amPm)
    }

    private fun logEvent(type: String, taskId: String? = null, title: String? = null, verification: String? = null) {
        val log = DailyEventLog(
            id = UUID.randomUUID().toString(),
            timestamp = java.time.Instant.now().toString(),
            effectiveTime = LocalTime.now().format(DateTimeFormatter.ofPattern("hh:mm:ss a")),
            type = type,
            taskId = taskId,
            title = title,
            verification = verification
        )
        _eventLogs.value = listOf(log) + _eventLogs.value
    }
}
