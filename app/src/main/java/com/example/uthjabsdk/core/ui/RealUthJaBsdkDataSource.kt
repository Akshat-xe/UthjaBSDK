package com.example.uthjabsdk.core.ui

import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.AcademicMailItem
import com.example.uthjabsdk.core.model.AcademicSummary
import com.example.uthjabsdk.core.model.AttendanceGroupSummary
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
import com.example.uthjabsdk.core.sync.DefaultSnapshotHttpClient
import com.example.uthjabsdk.core.sync.PhoneActionState
import com.example.uthjabsdk.core.sync.PhoneActionStorage
import com.example.uthjabsdk.core.sync.SecureCredentialStorage
import com.example.uthjabsdk.core.sync.SnapshotCache
import com.example.uthjabsdk.core.sync.SnapshotFetchResult
import com.example.uthjabsdk.core.sync.SnapshotHttpClient
import com.example.uthjabsdk.core.sync.SnapshotV1
import com.example.uthjabsdk.core.sync.SnapshotValidator
import com.example.uthjabsdk.core.sync.ValidationResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Real UthJaBsdkDataSource integrating manual HTTPS GET of SnapshotV1,
 * Keystore-protected token storage, SHA-256 validation, atomic local snapshot caching,
 * and persistent preservation of phone-entered actions across process restarts and snapshot imports.
 */
class RealUthJaBsdkDataSource(
    private val credentialStorage: SecureCredentialStorage,
    private val snapshotCache: SnapshotCache,
    private val phoneActionStorage: PhoneActionStorage,
    private val httpClient: SnapshotHttpClient = DefaultSnapshotHttpClient(),
    private val coroutineScope: CoroutineScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
) : UthJaBsdkDataSource {

    override fun exportPhoneActions(): String? = phoneActionStorage.exportJson()

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

        private val DEFAULT_SOURCES = mapOf(
            "newton" to SyncSourceState("newton", "NST attendance", SyncSourceStateStatus.WAITING, "Waiting for sync"),
            "rishiverse" to SyncSourceState("rishiverse", "RUFP attendance", SyncSourceStateStatus.WAITING, "Waiting for sync"),
            "gmail" to SyncSourceState("gmail", "Academic mail", SyncSourceStateStatus.WAITING, "Waiting for sync"),
            "radar" to SyncSourceState("radar", "Opportunity Radar", SyncSourceStateStatus.WAITING, "Waiting for sync"),
            "menu" to SyncSourceState("menu", "Campus mess menu", SyncSourceStateStatus.WAITING, "Waiting for sync")
        )
    }

    // Observable UI State
    private val _currentDate = MutableStateFlow(LocalDate.now().toString())
    override val currentDate: StateFlow<String> = _currentDate.asStateFlow()

    private val _allDays = MutableStateFlow<Map<String, DayRecord>>(emptyMap())
    override val allDays: StateFlow<Map<String, DayRecord>> = _allDays.asStateFlow()

    private val _currentDay = MutableStateFlow(DayRecord(date = _currentDate.value))
    override val currentDay: StateFlow<DayRecord> = _currentDay.asStateFlow()

    private val _syncState = MutableStateFlow(
        SyncStatus(
            overallState = SyncOverallState.IDLE,
            isRunning = false,
            lastSyncTime = null,
            revision = null,
            sources = DEFAULT_SOURCES,
            errorMessage = if (credentialStorage.getEndpointUrl() == null) "Phone not paired with Convex" else null
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

    private val _academicSummary = MutableStateFlow(AcademicSummary(
        combined = AttendanceGroupSummary(0, 0, 0f),
        nst = AttendanceGroupSummary(0, 0, 0f),
        rufp = AttendanceGroupSummary(0, 0, 0f),
        contestXp = 0
    ))
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

    private val _foodEntries = MutableStateFlow<List<FoodEntry>>(emptyList())
    val foodEntries: StateFlow<List<FoodEntry>> = _foodEntries.asStateFlow()

    // Internal user actions tracking
    private var userRadarFavorites = mutableSetOf<String>()
    private var userRadarProgress = mutableMapOf<String, String>()
    private val customTasks = mutableListOf<RoutineTask>()
    private var activeSnapshot: SnapshotV1? = null

    init {
        loadPersistedState()
    }

    private fun loadPersistedState() {
        // 1. Load phone-entered actions
        val savedActions = phoneActionStorage.load()
        if (savedActions != null) {
            _currentDate.value = LocalDate.now().toString()
            _alarmsEnabled.value = savedActions.alarmsEnabled
            _allDays.value = savedActions.dayRecords
            _currentDay.value = savedActions.dayRecords[_currentDate.value] ?: DayRecord(date = _currentDate.value)
            _foodEntries.value = savedActions.foodEntries
            _wardrobe.value = savedActions.wardrobe
            _studyNotes.value = savedActions.studyNotes
            _eventLogs.value = savedActions.eventLogs
            userRadarFavorites.clear()
            userRadarFavorites.addAll(savedActions.radarFavorites)
            userRadarProgress.clear()
            userRadarProgress.putAll(savedActions.radarProgress)
            customTasks.addAll(savedActions.customTasks)
        } else {
            // Baseline initial phone state
            val initialDay = DayRecord(date = _currentDate.value)
            _allDays.value = mapOf(_currentDate.value to initialDay)
            _currentDay.value = initialDay
            persistPhoneActions()
        }

        // 2. Load cached SnapshotV1 if present
        val cached = snapshotCache.loadCachedSnapshot()
        if (cached != null) {
            applySnapshot(cached.snapshot, isInitialCacheLoad = true)
        }
    }

    private fun persistPhoneActions() {
        val state = PhoneActionState(
            currentDate = _currentDate.value,
            alarmsEnabled = _alarmsEnabled.value,
            dayRecords = _allDays.value,
            foodEntries = _foodEntries.value,
            wardrobe = _wardrobe.value,
            studyNotes = _studyNotes.value,
            radarFavorites = userRadarFavorites.toSet(),
            radarProgress = userRadarProgress.toMap(),
            eventLogs = _eventLogs.value,
            customTasks = customTasks.toList()
        )
        phoneActionStorage.save(state)
    }

    /**
     * Maps SnapshotV1 into UthJaBsdkDataSource while strictly preserving phone-entered actions.
     */
    fun applySnapshot(snapshot: SnapshotV1, isInitialCacheLoad: Boolean = false) {
        val previousRevision = _syncState.value.revision
        activeSnapshot = snapshot

        // Academic Summary
        val att = snapshot.academic.attendance
        val comb = att?.combined
        val nst = att?.nst
        val rufp = att?.rufp
        _academicSummary.value = AcademicSummary(
            semester = snapshot.academic.semester ?: "Semester 1",
            importedAt = formatTimestamp(snapshot.academic.importedAt ?: snapshot.publishedAt),
            combined = AttendanceGroupSummary(
                attended = comb?.attended ?: 0,
                total = comb?.total ?: 0,
                percent = comb?.percent ?: 0f
            ),
            nst = AttendanceGroupSummary(
                attended = nst?.attended ?: 0,
                total = nst?.total ?: 0,
                percent = nst?.percent ?: 0f
            ),
            rufp = AttendanceGroupSummary(
                attended = rufp?.attended ?: 0,
                total = rufp?.total ?: 0,
                percent = rufp?.percent ?: 0f
            ),
            contestXp = 0
        )

        // Course Attendances
        _courseAttendances.value = snapshot.academic.subjects.map { subj ->
            CourseAttendance(
                name = subj.name,
                code = subj.code,
                group = subj.group,
                attended = subj.attended,
                total = subj.total,
                percent = subj.percent,
                canMiss = subj.canMiss,
                needAttend = subj.needAttend
            )
        }

        // Weekly Classes
        _weeklyClasses.value = snapshot.academic.schedule.flatMap { day ->
            day.items.map { item ->
                AcademicClass(
                    source = if (item.subject.contains("RUFP") || item.type.contains("Foundation")) "RUFP" else "NST",
                    title = item.title.ifBlank { item.subject },
                    time = item.time,
                    location = item.location,
                    start = parseTimeToMinutes(item.time),
                    topic = item.subject,
                    dateKey = day.date
                )
            }
        }

        // Academic Mails
        _academicMails.value = snapshot.academic.emails.mapIndexed { idx, mail ->
            AcademicMailItem(
                id = "mail-$idx",
                subject = mail.subject,
                sender = mail.sender,
                date = mail.date,
                snippet = mail.summary,
                category = mail.category,
                priority = mail.priority,
                actionItem = mail.actionItem ?: ""
            )
        }

        // Radar Opportunities: merge server listings with phone favorites and progress
        _radarItems.value = snapshot.radar.opportunities.map { opp ->
            val isFav = userRadarFavorites.contains(opp.id)
            val prog = userRadarProgress[opp.id] ?: "Not started"
            val hours = opp.effortHours?.let { Regex("\\d+").find(it)?.value?.toIntOrNull() } ?: 20
            RadarOpportunity(
                id = opp.id,
                title = opp.title,
                organizer = opp.organizer,
                platform = opp.platform,
                areaScope = opp.areaScope,
                location = if (opp.locationLabel.isNotBlank()) opp.locationLabel else opp.location,
                distanceKm = opp.distanceKm?.toInt(),
                startDate = opp.startDate,
                endDate = opp.endDate,
                registrationDeadline = opp.registrationDeadline,
                prizePool = opp.prizePool,
                teamSize = opp.teamSize ?: "Individual",
                tier = opp.tier,
                difficulty = opp.difficulty,
                description = opp.description ?: opp.summary ?: "",
                eventUrl = opp.eventUrl,
                effortHours = hours,
                confidence = opp.confidence ?: "Medium",
                saved = isFav,
                progress = prog
            )
        }

        // Campus Meal Menu
        if (snapshot.menu.menu.isNotEmpty()) {
            _mealMenu.value = snapshot.menu.menu
        }

        // Sync State
        val mappedSources = snapshot.sources.mapValues { (name, src) ->
            val label = when (name) {
                "newton" -> "NST attendance"
                "rishiverse" -> "RUFP attendance"
                "gmail" -> "Academic mail"
                "radar" -> "Opportunity Radar"
                "menu" -> "Campus mess menu"
                else -> name
            }
            val status = when (src.status) {
                "success" -> SyncSourceStateStatus.SUCCESS
                "partial" -> SyncSourceStateStatus.PARTIAL
                "failed" -> SyncSourceStateStatus.FAILED
                "setup_required" -> SyncSourceStateStatus.SETUP_REQUIRED
                "running" -> SyncSourceStateStatus.RUNNING
                else -> SyncSourceStateStatus.WAITING
            }
            val updated = src.updatedAt?.let(::formatTimestamp)
            val msg = when {
                name == "gmail" && status == SyncSourceStateStatus.SUCCESS && snapshot.academic.emails.isEmpty() ->
                    "No approved notices in this update"
                src.freshness == "fresh" -> updated?.let { "Updated $it" } ?: "Updated"
                status == SyncSourceStateStatus.SETUP_REQUIRED -> "Connect this source on your laptop"
                status == SyncSourceStateStatus.FAILED -> "Update failed; saved data remains"
                updated != null -> "Saved data from $updated"
                else -> "No recent update"
            }
            SyncSourceState(name, label, status, msg)
        }

        _syncState.value = SyncStatus(
            overallState = if (mappedSources.values.all { it.status == SyncSourceStateStatus.SUCCESS })
                SyncOverallState.SUCCESS else SyncOverallState.PARTIAL,
            isRunning = false,
            lastSyncTime = formatTimestamp(snapshot.publishedAt),
            revision = snapshot.revision,
            sources = mappedSources,
            errorMessage = null
        )

        if (!isInitialCacheLoad && previousRevision != snapshot.revision) {
            logEvent(
                type = "snapshot_imported",
                title = "Manual Snapshot Import",
                verification = "Revision ${snapshot.revision} (${snapshot.sha256Hex.take(8)})"
            )
            persistPhoneActions()
        }
    }

    private fun parseTimeToMinutes(timeStr: String): Int {
        return try {
            val parts = timeStr.split(":", "-")
            val h = parts[0].trim().toInt()
            val m = parts.getOrNull(1)?.trim()?.take(2)?.toIntOrNull() ?: 0
            h * 60 + m
        } catch (_: Exception) {
            540
        }
    }

    // --- MANUAL HTTPS GET ON SYNC TAP ---

    override fun triggerSync() {
        val endpointUrl = credentialStorage.getEndpointUrl()
        if (endpointUrl.isNullOrBlank()) {
            _syncState.value = _syncState.value.copy(
                overallState = SyncOverallState.ERROR,
                isRunning = false,
                errorMessage = "Pairing required: please configure an HTTPS endpoint in Sync Settings."
            )
            return
        }

        val readToken = credentialStorage.getReadToken()

        _syncState.value = _syncState.value.copy(
            overallState = SyncOverallState.RUNNING,
            isRunning = true,
            errorMessage = null,
            sources = _syncState.value.sources.mapValues { (_, src) ->
                src.copy(status = SyncSourceStateStatus.RUNNING, message = "Fetching snapshot…")
            }
        )

        coroutineScope.launch {
            when (val fetchResult = httpClient.fetchSnapshot(endpointUrl, readToken)) {
                is SnapshotFetchResult.Success -> {
                    when (val valResult = SnapshotValidator.validate(fetchResult.jsonString)) {
                        is ValidationResult.Success -> {
                            if (!fetchResult.sha256Hex.matches(Regex("[a-fA-F0-9]{64}")) ||
                                !fetchResult.sha256Hex.equals(valResult.sha256Hex, ignoreCase = true)) {
                                _syncState.value = _syncState.value.copy(
                                    overallState = SyncOverallState.ERROR,
                                    isRunning = false,
                                    errorMessage = "Snapshot checksum did not match the server response"
                                )
                                return@launch
                            }
                            val snapshot = valResult.snapshot
                            if (!snapshotCache.saveSnapshot(
                                jsonString = fetchResult.jsonString,
                                sha256Hex = valResult.sha256Hex,
                                revision = snapshot.revision
                            )) {
                                _syncState.value = _syncState.value.copy(
                                    overallState = SyncOverallState.ERROR,
                                    isRunning = false,
                                    errorMessage = "Could not save snapshot on this phone"
                                )
                                return@launch
                            }
                            applySnapshot(snapshot, isInitialCacheLoad = false)
                        }
                        is ValidationResult.Error -> {
                            _syncState.value = _syncState.value.copy(
                                overallState = SyncOverallState.ERROR,
                                isRunning = false,
                                errorMessage = "Validation failed: ${valResult.message}",
                                sources = _syncState.value.sources.mapValues { (_, src) ->
                                    src.copy(status = SyncSourceStateStatus.FAILED, message = "Validation rejected")
                                }
                            )
                        }
                    }
                }
                is SnapshotFetchResult.HttpError -> {
                    _syncState.value = _syncState.value.copy(
                        overallState = SyncOverallState.ERROR,
                        isRunning = false,
                        errorMessage = "HTTP ${fetchResult.statusCode}: ${fetchResult.message}",
                        sources = _syncState.value.sources.mapValues { (_, src) ->
                            src.copy(status = SyncSourceStateStatus.FAILED, message = "HTTP ${fetchResult.statusCode}")
                        }
                    )
                }
                is SnapshotFetchResult.NetworkError -> {
                    _syncState.value = _syncState.value.copy(
                        overallState = SyncOverallState.ERROR,
                        isRunning = false,
                        errorMessage = "Network error: ${fetchResult.message}",
                        sources = _syncState.value.sources.mapValues { (_, src) ->
                            src.copy(status = SyncSourceStateStatus.FAILED, message = "Connection failed")
                        }
                    )
                }
            }
        }
    }

    // --- PAIRING MANAGEMENT ---

    fun getPairingEndpoint(): String? = credentialStorage.getEndpointUrl()
    fun isPairingConfigured(): Boolean = !credentialStorage.getEndpointUrl().isNullOrBlank()
    fun isReadTokenConfigured(): Boolean = !credentialStorage.getReadToken().isNullOrBlank()

    fun updatePairing(endpoint: String?, token: String?) {
        credentialStorage.setEndpointUrl(endpoint)
        if (!token.isNullOrBlank()) credentialStorage.setReadToken(token)
        if (endpoint.isNullOrBlank()) {
            _syncState.value = _syncState.value.copy(
                errorMessage = "Phone not paired with Convex"
            )
        } else {
            _syncState.value = _syncState.value.copy(
                errorMessage = null
            )
        }
    }

    fun clearPairing() {
        credentialStorage.clear()
        _syncState.value = _syncState.value.copy(
            errorMessage = "Phone not paired with Convex"
        )
    }

    // --- QUERY METHODS ---

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
        val customIds = customForDate.map { it.id }.toSet()
        list.removeAll { it.id in customIds }
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
        val days = ChronoUnit.DAYS.between(anchor, current)
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

    // --- USER ACTIONS (PERSISTED ON EVERY CALL) ---

    override fun setDate(dateKey: String) {
        _currentDate.value = dateKey
        val map = _allDays.value
        val day = map[dateKey] ?: DayRecord(date = dateKey)
        _currentDay.value = day
        persistPhoneActions()
    }

    override fun toggleAlarms() {
        _alarmsEnabled.value = !_alarmsEnabled.value
        persistPhoneActions()
    }

    override fun completeTask(task: RoutineTask, status: String, verification: String) {
        val key = _currentDate.value
        val map = _allDays.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val updatedDone = current.done.toMutableMap()
        updatedDone[task.id] = TaskRecord(
            at = Instant.now().toString(),
            recordedAt = Instant.now().toString(),
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
        _allDays.value = map
        _currentDay.value = updatedDay

        logEvent(type = status, taskId = task.id, title = task.title, verification = verification)
        persistPhoneActions()
    }

    override fun undoTask(task: RoutineTask) {
        val key = _currentDate.value
        val map = _allDays.value.toMutableMap()
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
        _allDays.value = map
        _currentDay.value = updatedDay

        logEvent(type = "undo", taskId = task.id, title = task.title)
        persistPhoneActions()
    }

    override fun saveCustomTask(task: RoutineTask) {
        val index = customTasks.indexOfFirst { it.id == task.id }
        if (index >= 0) customTasks[index] = task else customTasks.add(task)
        persistPhoneActions()
        _tasksRevision.value += 1
    }

    override fun togglePackingCheck(index: Int) {
        val key = _currentDate.value
        val map = _allDays.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val checks = current.checks.toMutableList()
        if (checks.contains(index)) {
            checks.remove(index)
        } else {
            checks.add(index)
        }

        val updatedDay = current.copy(checks = checks)
        map[key] = updatedDay
        _allDays.value = map
        _currentDay.value = updatedDay
        persistPhoneActions()
    }

    override fun addWater(ml: Int) {
        val key = _currentDate.value
        val map = _allDays.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val updatedDay = current.copy(waterMl = current.waterMl + ml)
        map[key] = updatedDay
        _allDays.value = map
        _currentDay.value = updatedDay

        logEvent(type = "water_added", taskId = "water", title = "+$ml ml water")
        persistPhoneActions()
    }

    override fun undoWater(previousMl: Int) {
        val key = _currentDate.value
        val map = _allDays.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val updatedDay = current.copy(waterMl = previousMl)
        map[key] = updatedDay
        _allDays.value = map
        _currentDay.value = updatedDay

        logEvent(type = "water_undo", taskId = "water")
        persistPhoneActions()
    }

    override fun addFoodEntry(meal: String, item: String, amount: String?) {
        val key = _currentDate.value
        val map = _allDays.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val entry = FoodEntry(
            id = UUID.randomUUID().toString(),
            meal = meal,
            item = item,
            amount = amount,
            at = Instant.now().toString()
        )

        val entries = current.foodEntries + entry
        val updatedDay = current.copy(foodEntries = entries)
        map[key] = updatedDay
        _allDays.value = map
        _currentDay.value = updatedDay

        logEvent(type = "food_logged", title = "$meal: $item")
        persistPhoneActions()
    }

    override fun removeFoodEntry(id: String) {
        val key = _currentDate.value
        val map = _allDays.value.toMutableMap()
        val current = map[key] ?: return

        val entries = current.foodEntries.filter { it.id != id }
        val updatedDay = current.copy(foodEntries = entries)
        map[key] = updatedDay
        _allDays.value = map
        _currentDay.value = updatedDay
        persistPhoneActions()
    }

    override fun logLaundryDrop() {
        val key = _currentDate.value
        val date = try { LocalDate.parse(key) } catch (_: Exception) { LocalDate.now() }
        val dueDate = date.plusDays(3).toString()

        val map = _allDays.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)
        val updatedDay = current.copy(
            laundry = LaundryRecord(dropDate = key, dueDate = dueDate)
        )
        map[key] = updatedDay
        _allDays.value = map
        _currentDay.value = updatedDay

        logEvent(type = "laundry_drop", taskId = "laundry", title = "Laundry dropped off")
        persistPhoneActions()
    }

    override fun collectLaundry(dropDate: String) {
        val map = _allDays.value.toMutableMap()
        val current = map[dropDate] ?: return
        val laundry = current.laundry ?: return

        val updatedDay = current.copy(
            laundry = laundry.copy(collectedAt = Instant.now().toString())
        )
        map[dropDate] = updatedDay
        _allDays.value = map
        if (_currentDate.value == dropDate) {
            _currentDay.value = updatedDay
        }

        logEvent(type = "laundry_collected", taskId = "laundry", title = "Laundry collected")
        persistPhoneActions()
    }

    override fun addWardrobeItem(name: String, photoUrl: String?) {
        val item = WardrobeItem(
            id = UUID.randomUUID().toString(),
            name = name,
            status = "Clean",
            photoUrl = photoUrl
        )
        _wardrobe.value = _wardrobe.value + item
        persistPhoneActions()
    }

    override fun setWardrobeStatus(id: String, status: String) {
        _wardrobe.value = _wardrobe.value.map {
            if (it.id == id) it.copy(status = status) else it
        }
        persistPhoneActions()
    }

    override fun toggleSwimCheck(index: Int) {
        val key = _currentDate.value
        val map = _allDays.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val checks = current.swimChecks.toMutableList()
        if (checks.contains(index)) {
            checks.remove(index)
        } else {
            checks.add(index)
        }

        val updatedDay = current.copy(swimChecks = checks)
        map[key] = updatedDay
        _allDays.value = map
        _currentDay.value = updatedDay
        persistPhoneActions()
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
        persistPhoneActions()
    }

    override fun toggleStudyNote(id: String) {
        _studyNotes.value = _studyNotes.value.map {
            if (it.id == id) it.copy(done = !it.done) else it
        }
        persistPhoneActions()
    }

    override fun setEveningMode(mode: String) {
        val key = _currentDate.value
        val map = _allDays.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val updatedDay = current.copy(mode = mode)
        map[key] = updatedDay
        _allDays.value = map
        _currentDay.value = updatedDay

        logEvent(type = "evening_mode", taskId = "evening", title = "Evening: $mode")
        persistPhoneActions()
    }

    override fun saveContestScore(taskId: String, score: Float) {
        val key = _currentDate.value
        val map = _allDays.value.toMutableMap()
        val current = map[key] ?: DayRecord(date = key)

        val scores = current.scores.toMutableMap()
        scores[taskId] = score

        val updatedDay = current.copy(scores = scores)
        map[key] = updatedDay
        _allDays.value = map
        _currentDay.value = updatedDay

        logEvent(type = "contest_score", taskId = taskId, title = "Score: $score%")
        persistPhoneActions()
    }

    override fun toggleRadarFavorite(id: String) {
        if (userRadarFavorites.contains(id)) {
            userRadarFavorites.remove(id)
        } else {
            userRadarFavorites.add(id)
        }
        _radarItems.value = _radarItems.value.map {
            if (it.id == id) it.copy(saved = userRadarFavorites.contains(id)) else it
        }
        persistPhoneActions()
    }

    override fun setRadarProgress(id: String, progress: String) {
        userRadarProgress[id] = progress
        _radarItems.value = _radarItems.value.map {
            if (it.id == id) it.copy(progress = progress) else it
        }
        persistPhoneActions()
    }

    override fun getWeeklyTimetable(selectedDate: String): List<WeeklyTimetableDay> {
        val date = try {
            LocalDate.parse(selectedDate)
        } catch (_: Exception) {
            LocalDate.parse("2026-09-25")
        }
        val monday = date.minusDays((date.dayOfWeek.value - 1).toLong())

        val dayNames = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
        return (0..4).map { offset ->
            val dayDate = monday.plusDays(offset.toLong())
            val classes = getClassesForDate(dayDate.toString(), offset + 1).map { task ->
                val startH = task.start / 60
                val startM = task.start % 60
                val endH = task.end / 60
                val endM = task.end % 60
                AcademicClass(
                    source = if (task.title.contains("Social") || task.title.contains("Society") || task.title.contains("India")) "RUFP" else "NST",
                    title = task.title,
                    time = String.format("%02d:%02d–%02d:%02d", startH, startM, endH, endM),
                    location = task.room ?: "A509",
                    start = task.start,
                    topic = task.detail,
                    dateKey = dayDate.toString()
                )
            }
            val isToday = dayDate == date
            val badge = if (isToday) "Today" else if (dayDate.isBefore(date)) "Past" else "Upcoming"
            WeeklyTimetableDay(
                key = dayDate.toString(),
                badge = badge,
                label = dayNames[offset],
                items = classes
            )
        }
    }

    private fun logEvent(
        type: String,
        taskId: String? = null,
        title: String? = null,
        verification: String? = null
    ) {
        val nowStr = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
        val log = DailyEventLog(
            id = UUID.randomUUID().toString(),
            timestamp = Instant.now().toString(),
            effectiveTime = nowStr,
            type = type,
            taskId = taskId,
            title = title,
            verification = verification
        )
        _eventLogs.value = listOf(log) + _eventLogs.value.take(49)
    }

    private fun formatTimestamp(isoString: String): String {
        return try {
            val instant = Instant.parse(isoString)
            val zonedDateTime = instant.atZone(ZoneId.of("Asia/Kolkata"))
            zonedDateTime.format(DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a"))
        } catch (_: Exception) {
            isoString
        }
    }
}
