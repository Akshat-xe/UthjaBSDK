package com.example.uthjabsdk

import com.example.uthjabsdk.core.model.RoutineTask
import com.example.uthjabsdk.core.model.SyncOverallState
import com.example.uthjabsdk.core.model.SyncSourceStateStatus
import com.example.uthjabsdk.core.sync.InMemoryCredentialStorage
import com.example.uthjabsdk.core.sync.JsonParser
import com.example.uthjabsdk.core.sync.MockSnapshotHttpClient
import com.example.uthjabsdk.core.sync.PhoneActionState
import com.example.uthjabsdk.core.sync.PhoneActionStorage
import com.example.uthjabsdk.core.sync.SnapshotCache
import com.example.uthjabsdk.core.sync.SnapshotFetchResult
import com.example.uthjabsdk.core.sync.SnapshotValidator
import com.example.uthjabsdk.core.sync.ValidationResult
import com.example.uthjabsdk.core.ui.RealUthJaBsdkDataSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.security.MessageDigest

class IntegrationAndSyncTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    private lateinit var testDir: File
    private lateinit var credentialStorage: InMemoryCredentialStorage
    private lateinit var snapshotCache: SnapshotCache
    private lateinit var phoneActionStorage: PhoneActionStorage
    private lateinit var mockHttpClient: MockSnapshotHttpClient

    @Before
    fun setup() {
        testDir = tempFolder.newFolder("uth_test_env")
        credentialStorage = InMemoryCredentialStorage(
            endpointUrl = "https://staging.convex.site/api/snapshot",
            readToken = "secret-token-1234"
        )
        snapshotCache = SnapshotCache(testDir)
        phoneActionStorage = PhoneActionStorage(testDir)
        mockHttpClient = MockSnapshotHttpClient { _, _ ->
            val json = sampleSnapshotJson(revision = "rev-101")
            val sha256 = SnapshotValidator.computeSha256(json.toByteArray(Charsets.UTF_8))
            SnapshotFetchResult.Success(json, sha256, 200)
        }
    }

    private fun sampleSnapshotJson(
        schemaVersion: Int = 1,
        revision: String = "rev-042",
        runId: String = "run-001",
        publishedAt: String = "2026-09-30T10:00:00Z"
    ): String {
        return """
        {
            "schemaVersion": $schemaVersion,
            "revision": "$revision",
            "runId": "$runId",
            "publishedAt": "$publishedAt",
            "sources": {
                "newton": { "status": "success", "freshness": "fresh", "updatedAt": "2026-09-30T09:50:00Z" },
                "rishiverse": { "status": "success", "freshness": "fresh", "updatedAt": "2026-09-30T09:51:00Z" },
                "gmail": { "status": "success", "freshness": "fresh", "updatedAt": "2026-09-30T09:52:00Z" },
                "radar": { "status": "success", "freshness": "fresh", "updatedAt": "2026-09-30T09:53:00Z" },
                "menu": { "status": "success", "freshness": "fresh", "updatedAt": "2026-09-30T09:54:00Z" }
            },
            "academic": {
                "importedAt": "2026-09-30T09:55:00Z",
                "semester": "Semester 3",
                "attendance": {
                    "combined": { "attended": 70, "total": 85, "percent": 82.4, "canMiss": 2, "needAttend": 0 },
                    "nst": { "attended": 50, "total": 60, "percent": 83.3, "canMiss": 2, "needAttend": 0 },
                    "rufp": { "attended": 20, "total": 25, "percent": 80.0, "canMiss": 0, "needAttend": 0 }
                },
                "subjects": [
                    { "name": "Systems & AI", "group": "NST Core", "code": "SYS101", "attended": 18, "total": 20, "absent": 2, "percent": 90.0, "canMiss": 3, "needAttend": 0 },
                    { "name": "Problem Solving", "group": "NST Core", "code": "CS101", "attended": 17, "total": 20, "absent": 3, "percent": 85.0, "canMiss": 2, "needAttend": 0 }
                ],
                "schedule": [
                    {
                        "date": "2026-10-01",
                        "badge": "Thursday",
                        "items": [
                            { "time": "09:00", "subject": "Systems & AI", "type": "Lecture", "title": "Neural Networks", "status": "Scheduled", "location": "Room A305" }
                        ]
                    }
                ],
                "emails": [
                    { "sender": "Dean of Academics", "subject": "Midterm Exam Notice", "summary": "Exams start on Oct 15 in Main Hall.", "date": "2026-09-30", "category": "Academic", "priority": "urgent", "actionItem": "Review hall ticket" }
                ]
            },
            "radar": {
                "fetchedAt": "2026-09-30T09:53:00Z",
                "opportunities": [
                    {
                        "id": "opp-101",
                        "title": "Smart India Hackathon 2026",
                        "organizer": "AICTE",
                        "platform": "Unstop",
                        "event_url": "https://unstop.com/hackathons/sih",
                        "mode": "hybrid",
                        "location": "New Delhi",
                        "locationLabel": "NCR · 45km from Sonipat",
                        "areaScope": "nearby",
                        "distanceKm": 45.0,
                        "prizePool": "INR 1,00,000",
                        "teamSize": "6 members",
                        "tier": "S",
                        "difficulty": "medium",
                        "analysis": { "tier": "Tier A", "tierKey": "A", "difficulty": "easy" },
                        "summary": "Premier nationwide hackathon for students.",
                        "skills_required": ["Kotlin", "Python", "AI"]
                    }
                ]
            },
            "menu": {
                "fetchedAt": "2026-09-30T09:54:00Z",
                "menu": {
                    "Monday": { "breakfast": ["Poha", "Tea"], "lunch": ["Dal", "Rice"], "snacks": ["Samosa"], "dinner": ["Paneer", "Roti"] },
                    "Tuesday": { "breakfast": ["Paratha"], "lunch": ["Rajma"], "snacks": ["Biscuits"], "dinner": ["Mix Veg"] },
                    "Wednesday": { "breakfast": ["Idli"], "lunch": ["Kadhi"], "snacks": ["Pakoda"], "dinner": ["Chole"] },
                    "Thursday": { "breakfast": ["Upma"], "lunch": ["Kofta"], "snacks": ["Puff"], "dinner": ["Dal Fry"] },
                    "Friday": { "breakfast": ["Puri"], "lunch": ["Egg Curry"], "snacks": ["Cutlet"], "dinner": ["Biryani"] },
                    "Saturday": { "breakfast": ["Sandwich"], "lunch": ["Sambhar"], "snacks": ["Cake"], "dinner": ["Pav Bhaji"] },
                    "Sunday": { "breakfast": ["Dosa"], "lunch": ["Special Thali"], "snacks": ["Tea"], "dinner": ["Gulab Jamun"] }
                }
            }
        }
        """.trimIndent()
    }

    @Test
    fun testJsonParserRoundTrip() {
        val original = mapOf(
            "str" to "hello \"world\"\nnewline",
            "num" to 42,
            "float" to 3.1415,
            "bool" to true,
            "nil" to null,
            "list" to listOf("a", 1, false),
            "nested" to mapOf("key" to "value")
        )
        val json = JsonParser.toJson(original)
        val parsed = JsonParser.parseObject(json)

        assertEquals("hello \"world\"\nnewline", parsed["str"])
        assertEquals(42, (parsed["num"] as Number).toInt())
        assertEquals(3.1415, (parsed["float"] as Number).toDouble(), 0.0001)
        assertEquals(true, parsed["bool"])
        assertNull(parsed["nil"])
        assertEquals(listOf("a", 1, false), parsed["list"])
        assertEquals(mapOf("key" to "value"), parsed["nested"])
    }

    @Test
    fun testSha256ChecksumCalculation() {
        val input = "UthJaBSDK Snapshot Verification"
        val expectedDigest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        val expectedHex = expectedDigest.joinToString("") { "%02x".format(it) }

        val actualHex = SnapshotValidator.computeSha256(input.toByteArray(Charsets.UTF_8))
        assertEquals(64, actualHex.length)
        assertEquals(expectedHex, actualHex)
    }

    @Test
    fun testSnapshotV1Validation_validPayload() {
        val json = sampleSnapshotJson(revision = "rev-v1-test")
        val result = SnapshotValidator.validate(json)

        assertTrue("Validation should succeed", result is ValidationResult.Success)
        val success = result as ValidationResult.Success
        assertEquals(1, success.snapshot.schemaVersion)
        assertEquals("rev-v1-test", success.snapshot.revision)
        assertEquals("run-001", success.snapshot.runId)
        assertEquals(82.4f, success.snapshot.academic.attendance?.combined?.percent ?: 0f, 0.01f)
        assertEquals(2, success.snapshot.academic.subjects.size)
        assertEquals("Systems & AI", success.snapshot.academic.subjects[0].name)
        assertEquals(1, success.snapshot.academic.emails.size)
        assertEquals("opp-101", success.snapshot.radar.opportunities[0].id)
        assertEquals(listOf("Poha", "Tea"), success.snapshot.menu.menu["Monday"]?.get("breakfast"))
        assertEquals(64, success.sha256Hex.length)
    }

    @Test
    fun testSnapshotV1Validation_invalidSchemaVersion() {
        val json = sampleSnapshotJson(schemaVersion = 2)
        val result = SnapshotValidator.validate(json)
        assertTrue(result is ValidationResult.Error)
        assertTrue((result as ValidationResult.Error).message.contains("expected 1"))
    }

    @Test
    fun testSnapshotV1Validation_missingRequiredMetadata() {
        val json = sampleSnapshotJson(revision = "")
        val result = SnapshotValidator.validate(json)
        assertTrue(result is ValidationResult.Error)
        assertTrue((result as ValidationResult.Error).message.contains("revision"))
    }

    @Test
    fun testSnapshotCache_atomicSaveAndLoad() {
        val json = sampleSnapshotJson(revision = "rev-cache-001")
        val sha256 = SnapshotValidator.computeSha256(json.toByteArray(Charsets.UTF_8))

        // Save atomically
        val saved = snapshotCache.saveSnapshot(json, sha256, "rev-cache-001")
        assertTrue("Snapshot should save atomically", saved)

        // Read back
        val cached = snapshotCache.loadCachedSnapshot()
        assertNotNull("Cached record should exist", cached)
        assertEquals("rev-cache-001", cached!!.snapshot.revision)
        assertEquals(sha256, cached.sha256Hex)

        // Clear
        snapshotCache.clear()
        assertNull("Cache should be null after clear", snapshotCache.loadCachedSnapshot())
    }

    @Test
    fun testSnapshotCache_singleFileRejectsTruncation() {
        val json = sampleSnapshotJson(revision = "rev-atomic")
        val sha = SnapshotValidator.computeSha256(json.toByteArray(Charsets.UTF_8))
        assertTrue(snapshotCache.saveSnapshot(json, sha, "rev-atomic"))
        val envelope = File(testDir, "snapshot_cache/snapshot_v1.cache")
        assertTrue(envelope.isFile)
        envelope.writeBytes(envelope.readBytes().copyOf(12))
        assertNull(snapshotCache.loadCachedSnapshot())
    }

    @Test
    fun testSnapshotCache_readsPreviousTwoFileFormat() {
        val json = sampleSnapshotJson(revision = "rev-legacy")
        val sha = SnapshotValidator.computeSha256(json.toByteArray(Charsets.UTF_8))
        val cacheDir = File(testDir, "snapshot_cache").apply { mkdirs() }
        File(cacheDir, "snapshot_v1.json").writeText(json)
        File(cacheDir, "snapshot_v1.meta").writeText("rev-legacy\n$sha\n123")
        assertEquals("rev-legacy", snapshotCache.loadCachedSnapshot()?.snapshot?.revision)
    }

    @Test
    fun testSnapshotCache_removesLegacyFilesAfterValidSave() {
        val cacheDir = File(testDir, "snapshot_cache").apply { mkdirs() }
        val legacyJson = File(cacheDir, "snapshot_v1.json").apply { writeText("private legacy data") }
        val legacyMeta = File(cacheDir, "snapshot_v1.meta").apply { writeText("old metadata") }
        val json = sampleSnapshotJson(revision = "rev-migrated")
        val sha = SnapshotValidator.computeSha256(json.toByteArray(Charsets.UTF_8))

        assertTrue(snapshotCache.saveSnapshot(json, sha, "rev-migrated"))
        assertFalse(legacyJson.exists())
        assertFalse(legacyMeta.exists())
        assertEquals("rev-migrated", snapshotCache.loadCachedSnapshot()?.snapshot?.revision)
    }

    @Test
    fun testCustomTaskSignalsUiAndSurvivesRestart() {
        val source = RealUthJaBsdkDataSource(
            credentialStorage = credentialStorage,
            snapshotCache = snapshotCache,
            phoneActionStorage = phoneActionStorage,
            httpClient = mockHttpClient,
            coroutineScope = CoroutineScope(Dispatchers.Unconfined)
        )
        val date = source.currentDate.value
        val task = RoutineTask(id = "custom-reactive", title = "Review notes", start = 1140,
            end = 1170, kind = "routine", detail = "Review today's notes", date = date)
        val before = source.tasksRevision.value
        source.saveCustomTask(task)
        assertEquals(before + 1, source.tasksRevision.value)
        assertTrue(source.getTasksForDate(date).any { it.id == task.id })
        val reopened = RealUthJaBsdkDataSource(credentialStorage, snapshotCache, phoneActionStorage,
            mockHttpClient, CoroutineScope(Dispatchers.Unconfined))
        assertTrue(reopened.getTasksForDate(date).any { it.id == task.id })
    }

    @Test
    fun testPhoneActions_persistenceSurvivesRestart() {
        val initialDay = com.example.uthjabsdk.core.model.DayRecord(
            date = "2026-09-25",
            waterMl = 1250,
            checks = listOf(0, 1, 3),
            swimChecks = listOf(0, 2),
            mode = "guided",
            foodEntries = listOf(com.example.uthjabsdk.core.model.FoodEntry(
                id = "meal-1", meal = "lunch", item = "Dal and rice", at = "2026-09-25T12:00:00Z"
            ))
        )
        val state = PhoneActionState(
            currentDate = "2026-09-25",
            alarmsEnabled = true,
            dayRecords = mapOf("2026-09-25" to initialDay),
            radarFavorites = setOf("opp-101"),
            radarProgress = mapOf("opp-101" to "Registered"),
            customTasks = listOf(RoutineTask(
                id = "custom-1", title = "Call home", start = 1140, end = 1170,
                kind = "routine", detail = "Evening check-in", date = "2026-09-25"
            ))
        )

        phoneActionStorage.save(state)
        val exported = phoneActionStorage.exportJson()
        assertNotNull(exported)
        assertTrue(exported!!.contains("\"Call home\""))
        assertTrue(exported.contains("\"opp-101\""))

        // Simulate new instance reading storage
        val newStorage = PhoneActionStorage(testDir)
        val loaded = newStorage.load()

        assertNotNull(loaded)
        assertEquals("2026-09-25", loaded!!.currentDate)
        assertTrue(loaded.alarmsEnabled)
        assertEquals(1250, loaded.dayRecords["2026-09-25"]?.waterMl)
        assertEquals(listOf(0, 1, 3), loaded.dayRecords["2026-09-25"]?.checks)
        assertEquals(listOf(0, 2), loaded.dayRecords["2026-09-25"]?.swimChecks)
        assertEquals("guided", loaded.dayRecords["2026-09-25"]?.mode)
        assertTrue(loaded.radarFavorites.contains("opp-101"))
        assertEquals("Registered", loaded.radarProgress["opp-101"])
        assertEquals("Call home", loaded.customTasks.single().title)
        assertEquals("Dal and rice", loaded.dayRecords["2026-09-25"]?.foodEntries?.single()?.item)
    }

    @Test
    fun testPhoneActions_preservedAcrossSnapshotImports() = runBlocking {
        val dataSource = RealUthJaBsdkDataSource(
            credentialStorage = credentialStorage,
            snapshotCache = snapshotCache,
            phoneActionStorage = phoneActionStorage,
            httpClient = mockHttpClient,
            coroutineScope = CoroutineScope(Dispatchers.Unconfined)
        )

        // User records water and task completion on the phone
        dataSource.addWater(500)
        dataSource.togglePackingCheck(2)
        dataSource.completeTask(
            task = RoutineTask(id = "wake", title = "Wake up", start = 295, end = 305, kind = "wake", detail = ""),
            status = "done",
            verification = "live_selfie"
        )
        dataSource.toggleRadarFavorite("opp-101")
        dataSource.setRadarProgress("opp-101", "Building")

        assertEquals(500, dataSource.currentDay.value.waterMl)
        assertTrue(dataSource.currentDay.value.checks.contains(2))
        assertEquals("done", dataSource.currentDay.value.done["wake"]?.status)

        // Now trigger sync to import SnapshotV1
        dataSource.triggerSync()

        // Verify snapshot was applied
        assertEquals(SyncOverallState.SUCCESS, dataSource.syncState.value.overallState)
        assertEquals("rev-101", dataSource.syncState.value.revision)

        // Verify phone-entered user actions are 100% PRESERVED
        assertEquals(500, dataSource.currentDay.value.waterMl)
        assertTrue(dataSource.currentDay.value.checks.contains(2))
        assertEquals("done", dataSource.currentDay.value.done["wake"]?.status)
        assertEquals("live_selfie", dataSource.currentDay.value.done["wake"]?.verification)

        // Radar opportunity was enriched from snapshot while preserving user favorite & progress!
        val opp = dataSource.radarItems.value.find { it.id == "opp-101" }
        assertNotNull(opp)
        assertTrue(opp!!.saved)
        assertEquals("Building", opp.progress)
        assertEquals("AICTE", opp.organizer)
        assertEquals("A", opp.tier)
    }

    @Test
    fun testManualSync_successFlow() = runBlocking {
        val dataSource = RealUthJaBsdkDataSource(
            credentialStorage = credentialStorage,
            snapshotCache = snapshotCache,
            phoneActionStorage = phoneActionStorage,
            httpClient = mockHttpClient,
            coroutineScope = CoroutineScope(Dispatchers.Unconfined)
        )

        assertEquals(SyncOverallState.IDLE, dataSource.syncState.value.overallState)
        assertFalse(dataSource.syncState.value.isRunning)

        dataSource.triggerSync()

        assertEquals(SyncOverallState.SUCCESS, dataSource.syncState.value.overallState)
        assertFalse(dataSource.syncState.value.isRunning)
        assertEquals("rev-101", dataSource.syncState.value.revision)
        assertNotNull(dataSource.syncState.value.lastSyncTime)
        assertEquals(SyncSourceStateStatus.SUCCESS, dataSource.syncState.value.sources["newton"]?.status)
        assertEquals(SyncSourceStateStatus.SUCCESS, dataSource.syncState.value.sources["menu"]?.status)
        assertEquals(1, dataSource.eventLogs.value.count { it.type == "snapshot_imported" })

        dataSource.triggerSync()
        assertEquals(1, dataSource.eventLogs.value.count { it.type == "snapshot_imported" })
        val reopened = RealUthJaBsdkDataSource(
            credentialStorage, snapshotCache, phoneActionStorage, mockHttpClient,
            CoroutineScope(Dispatchers.Unconfined)
        )
        assertEquals(1, reopened.eventLogs.value.count { it.type == "snapshot_imported" })
    }

    @Test
    fun testManualSync_rejectsServerChecksumMismatchWithoutReplacingCache() = runBlocking {
        val json = sampleSnapshotJson()
        mockHttpClient.setResult(SnapshotFetchResult.Success(json, "0".repeat(64), 200))
        val dataSource = RealUthJaBsdkDataSource(
            credentialStorage = credentialStorage,
            snapshotCache = snapshotCache,
            phoneActionStorage = phoneActionStorage,
            httpClient = mockHttpClient,
            coroutineScope = CoroutineScope(Dispatchers.Unconfined)
        )

        dataSource.triggerSync()

        assertEquals(SyncOverallState.ERROR, dataSource.syncState.value.overallState)
        assertTrue(dataSource.syncState.value.errorMessage?.contains("checksum") == true)
        assertNull(snapshotCache.loadCachedSnapshot())
    }

    @Test
    fun testManualSync_unpairedError() = runBlocking {
        credentialStorage.clear() // Remove endpoint
        val dataSource = RealUthJaBsdkDataSource(
            credentialStorage = credentialStorage,
            snapshotCache = snapshotCache,
            phoneActionStorage = phoneActionStorage,
            httpClient = mockHttpClient,
            coroutineScope = CoroutineScope(Dispatchers.Unconfined)
        )

        dataSource.triggerSync()

        assertEquals(SyncOverallState.ERROR, dataSource.syncState.value.overallState)
        assertTrue(dataSource.syncState.value.errorMessage?.contains("Pairing required") == true)
    }

    @Test
    fun testManualSync_httpError() = runBlocking {
        mockHttpClient.setResult(SnapshotFetchResult.HttpError(401, "Unauthorized token"))

        val dataSource = RealUthJaBsdkDataSource(
            credentialStorage = credentialStorage,
            snapshotCache = snapshotCache,
            phoneActionStorage = phoneActionStorage,
            httpClient = mockHttpClient,
            coroutineScope = CoroutineScope(Dispatchers.Unconfined)
        )

        dataSource.triggerSync()

        assertEquals(SyncOverallState.ERROR, dataSource.syncState.value.overallState)
        assertTrue(dataSource.syncState.value.errorMessage?.contains("401") == true)
    }

    @Test
    fun testManualSync_networkError() = runBlocking {
        mockHttpClient.setResult(SnapshotFetchResult.NetworkError("SSL handshake timed out"))

        val dataSource = RealUthJaBsdkDataSource(
            credentialStorage = credentialStorage,
            snapshotCache = snapshotCache,
            phoneActionStorage = phoneActionStorage,
            httpClient = mockHttpClient,
            coroutineScope = CoroutineScope(Dispatchers.Unconfined)
        )

        dataSource.triggerSync()

        assertEquals(SyncOverallState.ERROR, dataSource.syncState.value.overallState)
        assertTrue(dataSource.syncState.value.errorMessage?.contains("Network error") == true)
    }

    @Test
    fun testSecureCredentialStorage_inMemoryOperations() {
        val creds = InMemoryCredentialStorage()
        assertNull(creds.getEndpointUrl())
        assertNull(creds.getReadToken())

        creds.setEndpointUrl("https://my-convex.site/snapshot")
        creds.setReadToken("token-xyz")
        assertEquals("https://my-convex.site/snapshot", creds.getEndpointUrl())
        assertEquals("token-xyz", creds.getReadToken())

        creds.clear()
        assertNull(creds.getEndpointUrl())
        assertNull(creds.getReadToken())
    }

    @Test
    fun testSectionDScheduleParityOnRealDataSource() {
        val dataSource = RealUthJaBsdkDataSource(
            credentialStorage = credentialStorage,
            snapshotCache = snapshotCache,
            phoneActionStorage = phoneActionStorage,
            httpClient = mockHttpClient,
            coroutineScope = CoroutineScope(Dispatchers.Unconfined)
        )

        val tasks = dataSource.getTasksForDate("2026-09-14") // Monday
        val classes = tasks.filter { it.kind == "class" }

        assertEquals(4, classes.size)
        assertEquals("Systems & AI · Lab 1", classes[0].title)
        assertEquals("A305", classes[0].room)
        assertEquals(520, classes[0].start)
        assertEquals("Social Communication", classes[1].title)
        assertEquals("Problem solving · Lab 1", classes[2].title)
        assertEquals("Mathematics I · Lab 1", classes[3].title)
    }

    @Test
    fun testSnapshotV1Validation_malformedJson() {
        val result = SnapshotValidator.validate("{ not valid json }")
        assertTrue(result is ValidationResult.Error)
        assertTrue((result as ValidationResult.Error).message.contains("JSON parse error"))
    }

    @Test
    fun testSnapshotV1Validation_missingAcademicSection() {
        val json = """{"schemaVersion": 1, "revision": "rev-1", "runId": "run-1", "publishedAt": "2026-09-30T10:00:00Z"}"""
        val result = SnapshotValidator.validate(json)
        assertTrue(result is ValidationResult.Error)
        assertTrue((result as ValidationResult.Error).message.contains("academic"))
    }

    @Test
    fun testSnapshotV1Validation_invalidSourceStatus() {
        val json = sampleSnapshotJson().replace("\"status\": \"success\"", "\"status\": \"unrecognized_status\"")
        val result = SnapshotValidator.validate(json)
        assertTrue(result is ValidationResult.Error)
        assertTrue((result as ValidationResult.Error).message.contains("Invalid source status"))
    }

    @Test
    fun testSnapshotV1Validation_invalidTimestamp() {
        val json = sampleSnapshotJson().replace("\"publishedAt\": \"2026-09-30T10:00:00Z\"", "\"publishedAt\": \"not-a-date\"")
        val result = SnapshotValidator.validate(json)
        assertTrue(result is ValidationResult.Error)
        assertTrue((result as ValidationResult.Error).message.contains("timestamp"))
    }

    @Test
    fun testPhoneActionStorage_corruptFileGraceful() {
        val storageFile = File(testDir, "phone_actions/phone_actions.json")
        storageFile.parentFile?.mkdirs()
        storageFile.writeText("{ corrupt syntax: ", Charsets.UTF_8)

        val storage = PhoneActionStorage(testDir)
        assertNull("Corrupt action file should return null without crash", storage.load())
    }

    @Test
    fun testSnapshotCache_corruptFileGraceful() {
        val cacheFile = File(testDir, "snapshot_cache/snapshot_v1.json")
        cacheFile.parentFile?.mkdirs()
        cacheFile.writeText("invalid json content", Charsets.UTF_8)

        val cache = SnapshotCache(testDir)
        assertNull("Corrupt cache file should return null without crash", cache.loadCachedSnapshot())
    }
}
