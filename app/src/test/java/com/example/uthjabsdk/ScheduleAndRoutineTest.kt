package com.example.uthjabsdk

import com.example.uthjabsdk.core.model.RoutineTask
import com.example.uthjabsdk.core.ui.FakeUiDataSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalTime

class ScheduleAndRoutineTest {

    private lateinit var dataSource: FakeUiDataSource
    private var syncCallbackCount = 0

    @Before
    fun setup() {
        syncCallbackCount = 0
        dataSource = FakeUiDataSource(onSyncRequested = {
            syncCallbackCount++
        })
    }

    @Test
    fun testMondayScheduleParity() {
        val tasks = dataSource.getTasksForDate("2026-09-14") // Monday
        val classes = tasks.filter { it.kind == "class" }

        // Expected 4 classes on Monday:
        // 1. Systems & AI · Lab 1 (A305, 520 - 600)
        // 2. Social Communication (A509, 610 - 670)
        // 3. Problem solving · Lab 1 (A305, 840 - 920)
        // 4. Mathematics I · Lab 1 (A305, 930 - 1010)
        assertEquals(4, classes.size)
        assertEquals("Systems & AI · Lab 1", classes[0].title)
        assertEquals("A305", classes[0].room)
        assertEquals(520, classes[0].start)
        assertEquals(511, classes[0].trigger) // 9 minutes early

        assertEquals("Social Communication", classes[1].title)
        assertEquals("A509", classes[1].room)

        assertEquals("Problem solving · Lab 1", classes[2].title)
        assertEquals("A305", classes[2].room)

        assertEquals("Mathematics I · Lab 1", classes[3].title)
        assertEquals("A305", classes[3].room)

        // Monday also has laundry drop-off task
        val laundryDrop = tasks.find { it.id == "laundry-drop" }
        assertNotNull(laundryDrop)
        assertEquals(1010, laundryDrop!!.start) // 4:50 PM
    }

    @Test
    fun testFridayContestRotation() {
        // Contest anchor is 2026-09-18 (Friday, week 0: Problem solving & programming)
        val fri1 = dataSource.getTasksForDate("2026-09-18")
        val contest1 = fri1.find { it.kind == "contest" }
        assertNotNull(contest1)
        assertEquals("Contest · Problem solving & programming", contest1!!.title)

        // 2026-09-25 is week 1: Mathematics I
        val fri2 = dataSource.getTasksForDate("2026-09-25")
        val contest2 = fri2.find { it.kind == "contest" }
        assertNotNull(contest2)
        assertEquals("Contest · Mathematics I", contest2!!.title)

        // 2026-10-02 is week 2: Systems & AI
        val fri3 = dataSource.getTasksForDate("2026-10-02")
        val contest3 = fri3.find { it.kind == "contest" }
        assertNotNull(contest3)
        assertEquals("Contest · Systems & AI", contest3!!.title)
    }

    @Test
    fun testWeekendHasNoClasses() {
        val sat = dataSource.getTasksForDate("2026-09-19")
        val sun = dataSource.getTasksForDate("2026-09-20")
        assertEquals(0, sat.count { it.kind == "class" || it.kind == "contest" })
        assertEquals(0, sun.count { it.kind == "class" || it.kind == "contest" })
    }

    @Test
    fun testTaskCompletionAndUndo() {
        dataSource.setDate("2026-09-25")
        val task = RoutineTask(
            id = "wake",
            title = "Wake up",
            start = 295,
            end = 305,
            kind = "wake",
            detail = "Drink hot water"
        )

        assertFalse(dataSource.currentDay.value.done.containsKey("wake"))
        dataSource.completeTask(task, status = "done", verification = "live_selfie")

        assertTrue(dataSource.currentDay.value.done.containsKey("wake"))
        assertEquals("done", dataSource.currentDay.value.done["wake"]?.status)
        assertEquals("live_selfie", dataSource.currentDay.value.done["wake"]?.verification)

        // Undo
        dataSource.undoTask(task)
        assertFalse(dataSource.currentDay.value.done.containsKey("wake"))
    }

    @Test
    fun testClassAttendanceSyncs() {
        dataSource.setDate("2026-09-25")
        val classTask = RoutineTask(
            id = "systems",
            title = "Systems & AI",
            start = 690,
            end = 770,
            kind = "class",
            detail = "Go to room"
        )

        dataSource.completeTask(classTask, status = "present")
        assertEquals("present", dataSource.currentDay.value.attendance["systems"])

        dataSource.completeTask(classTask, status = "absent")
        assertEquals("absent", dataSource.currentDay.value.attendance["systems"])
    }

    @Test
    fun testWaterLogging() {
        dataSource.setDate("2026-09-25")
        val initialWater = dataSource.currentDay.value.waterMl
        dataSource.addWater(250)
        assertEquals(initialWater + 250, dataSource.currentDay.value.waterMl)

        dataSource.undoWater(initialWater)
        assertEquals(initialWater, dataSource.currentDay.value.waterMl)
    }

    @Test
    fun testBagPackingChecks() {
        dataSource.setDate("2026-09-25")
        assertEquals(12, FakeUiDataSource.PACKING_ITEMS.size)

        val initialChecked = dataSource.currentDay.value.checks.contains(0)
        dataSource.togglePackingCheck(0)
        assertEquals(!initialChecked, dataSource.currentDay.value.checks.contains(0))

        dataSource.togglePackingCheck(0)
        assertEquals(initialChecked, dataSource.currentDay.value.checks.contains(0))
    }

    @Test
    fun testFoodLogging() {
        dataSource.setDate("2026-09-25")
        val initialCount = dataSource.currentDay.value.foodEntries.size

        dataSource.addFoodEntry("Lunch", "Dal Makhani, Jeera Rice", "1 bowl")
        assertEquals(initialCount + 1, dataSource.currentDay.value.foodEntries.size)

        val added = dataSource.currentDay.value.foodEntries.last()
        assertEquals("Lunch", added.meal)
        assertEquals("Dal Makhani, Jeera Rice", added.item)

        dataSource.removeFoodEntry(added.id)
        assertEquals(initialCount, dataSource.currentDay.value.foodEntries.size)
    }

    @Test
    fun testLaundryLoopThreeDays() {
        dataSource.setDate("2026-09-21") // Monday
        dataSource.logLaundryDrop()

        val laundry = dataSource.currentDay.value.laundry
        assertNotNull(laundry)
        assertEquals("2026-09-21", laundry!!.dropDate)
        assertEquals("2026-09-24", laundry.dueDate) // Exactly 3 days later (Thursday)

        dataSource.collectLaundry("2026-09-21")
        assertNotNull(dataSource.currentDay.value.laundry?.collectedAt)
    }

    @Test
    fun testManualSyncCallsInjectedCallback() {
        assertEquals(0, syncCallbackCount)
        dataSource.triggerSync()
        assertEquals(1, syncCallbackCount)
        assertTrue(dataSource.syncState.value.isRunning)
    }

    @Test
    fun testWeeklyTimetableGeneration() {
        val days = dataSource.getWeeklyTimetable("2026-09-25")
        assertEquals(5, days.size)
        assertEquals("Past", days[0].badge) // Mon 21 is past relative to Fri 25
    }

    @Test
    fun testStudyNotesManagement() {
        val initialCount = dataSource.studyNotes.value.size
        dataSource.addStudyNote("Mathematics I", "Practice eigenvalues and eigenvectors", null)

        val updatedNotes = dataSource.studyNotes.value
        assertEquals(initialCount + 1, updatedNotes.size)
        val newNote = updatedNotes.first()
        assertEquals("Mathematics I", newNote.subject)
        assertFalse(newNote.done)

        dataSource.toggleStudyNote(newNote.id)
        val toggled = dataSource.studyNotes.value.find { it.id == newNote.id }
        assertNotNull(toggled)
        assertTrue(toggled!!.done)
    }

    @Test
    fun testRadarFavoritesAndProgress() {
        val firstItem = dataSource.radarItems.value.first()
        val initialSaved = firstItem.saved

        dataSource.toggleRadarFavorite(firstItem.id)
        assertEquals(!initialSaved, dataSource.radarItems.value.first { it.id == firstItem.id }.saved)

        dataSource.setRadarProgress(firstItem.id, "Building")
        assertEquals("Building", dataSource.radarItems.value.first { it.id == firstItem.id }.progress)
    }
}
