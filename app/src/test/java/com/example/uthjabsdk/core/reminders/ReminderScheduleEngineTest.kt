package com.example.uthjabsdk.core.reminders

import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.RoutineTask
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

class ReminderScheduleEngineTest {

    private val zoneId = ZoneId.of("Asia/Kolkata")
    private val futureDate = LocalDate.now(zoneId).plusDays(1)
    private val today = LocalDate.now(zoneId)

    @Test
    fun testAlarmsDisabledReturnsEmpty() {
        val tasks = DefaultRoutineScheduleProvider.getTasksForDate("2026-09-14")
        val reminders = ReminderScheduleEngine.computeReminders(
            alarmsEnabled = false,
            tasks = tasks,
            baseDate = futureDate,
            zoneId = zoneId
        )
        assertTrue(reminders.isEmpty())
    }

    @Test
    fun testPastDateReturnsEmpty() {
        val tasks = DefaultRoutineScheduleProvider.getTasksForDate("2026-09-14")
        val pastDate = today.minusDays(1)
        val reminders = ReminderScheduleEngine.computeReminders(
            alarmsEnabled = true,
            tasks = tasks,
            baseDate = pastDate,
            zoneId = zoneId
        )
        assertTrue(reminders.isEmpty())
    }

    @Test
    fun testQuietHoursAndQuietKindAreFiltered() {
        // Monday schedule contains "cooldown" (kind="quiet", 1020-1080)
        val mondayTasks = DefaultRoutineScheduleProvider.getTasksForDate("2026-09-14")

        // Ensure "cooldown" was originally present in tasks
        assertNotNull(mondayTasks.find { it.id == "cooldown" })

        val reminders = ReminderScheduleEngine.computeReminders(
            alarmsEnabled = true,
            tasks = mondayTasks,
            baseDate = futureDate,
            zoneId = zoneId
        )

        // Neither "cooldown" nor any reminder between 17:00 and 18:00 (1020-1080) should exist
        assertFalse(reminders.any { it.id == "cooldown" })
        assertFalse(reminders.any { it.kind == "quiet" })
        assertFalse(reminders.any { it.triggerMinuteOfDay in 1020 until 1080 })
    }

    @Test
    fun testCompletedTasksAreFiltered() {
        val tasks = listOf(
            RoutineTask(
                id = "wake",
                title = "Wake up",
                start = 295,
                end = 305,
                kind = "wake",
                detail = "Drink water"
            ),
            RoutineTask(
                id = "freshen",
                title = "Shower",
                start = 305,
                end = 345,
                kind = "routine",
                detail = "Freshen up"
            )
        )

        val reminders = ReminderScheduleEngine.computeReminders(
            alarmsEnabled = true,
            tasks = tasks,
            baseDate = futureDate,
            zoneId = zoneId,
            completedTaskIds = setOf("wake")
        )

        assertEquals(1, reminders.size)
        assertEquals("freshen", reminders[0].id)
    }

    @Test
    fun testElapsedRemindersFilteredForToday() {
        // Assume current time is 09:00 AM (minute 540)
        val ldt = LocalDateTime.of(today, LocalTime.of(9, 0))
        val currentEpoch = ldt.atZone(zoneId).toInstant().toEpochMilli()

        val tasks = listOf(
            RoutineTask(
                id = "wake",
                title = "Wake up",
                start = 295, // 04:55 AM (past)
                end = 305,
                kind = "wake",
                detail = "Morning"
            ),
            RoutineTask(
                id = "lunch",
                title = "Lunch & water",
                start = 780, // 01:00 PM (future)
                end = 831,
                kind = "meal",
                detail = "Have lunch"
            )
        )

        val reminders = ReminderScheduleEngine.computeReminders(
            alarmsEnabled = true,
            tasks = tasks,
            baseDate = today,
            zoneId = zoneId,
            nowEpochMillis = currentEpoch
        )

        // Wake is elapsed and should be dropped; Lunch is in the future and should remain
        assertEquals(1, reminders.size)
        assertEquals("lunch", reminders[0].id)
    }

    @Test
    fun testClassTriggerAndDeduplication() {
        val routineTasks = listOf(
            RoutineTask(
                id = "systems-lab",
                title = "Systems & AI · Lab 1",
                start = 520, // 08:40 AM
                end = 600,
                trigger = 511, // 08:31 AM
                kind = "class",
                detail = "Go to A305",
                room = "A305"
            )
        )

        val classes = listOf(
            AcademicClass(
                source = "NST",
                title = "Systems & AI · Lab 1",
                time = "08:40 - 10:00",
                location = "A305",
                start = 520
            ),
            AcademicClass(
                source = "NST",
                title = "Social Communication",
                time = "10:10 - 11:10",
                location = "A509",
                start = 610 // 10:10 AM, trigger 601 (09:01 AM)
            )
        )

        val reminders = ReminderScheduleEngine.computeReminders(
            alarmsEnabled = true,
            tasks = routineTasks,
            classes = classes,
            baseDate = futureDate,
            zoneId = zoneId
        )

        // "systems-lab" from routine tasks and new class Social Communication
        assertEquals(2, reminders.size)
        assertEquals("systems-lab", reminders[0].id)
        assertTrue(reminders.any { it.title == "Social Communication" })
    }

    @Test
    fun testAscendingSortOrder() {
        val tasks = DefaultRoutineScheduleProvider.getTasksForDate("2026-09-14")
        val reminders = ReminderScheduleEngine.computeReminders(
            alarmsEnabled = true,
            tasks = tasks,
            baseDate = futureDate,
            zoneId = zoneId
        )

        assertTrue(reminders.isNotEmpty())
        for (i in 0 until reminders.size - 1) {
            assertTrue(
                "Reminders must be sorted chronologically",
                reminders[i].triggerEpochMillis <= reminders[i + 1].triggerEpochMillis
            )
        }
    }
}
