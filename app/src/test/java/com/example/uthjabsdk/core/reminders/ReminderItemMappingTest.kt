package com.example.uthjabsdk.core.reminders

import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.RoutineTask
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class ReminderItemMappingTest {

    private val testDate = LocalDate.parse("2026-09-25")
    private val zoneId = ZoneId.of("Asia/Kolkata")

    @Test
    fun testRoutineTaskConversion() {
        val task = RoutineTask(
            id = "systems-lab",
            title = "Systems & AI · Lab 1",
            start = 520, // 8:40 AM
            end = 600,   // 10:00 AM
            trigger = 511, // 8:31 AM
            kind = "class",
            detail = "Go to A305. Complete campus facial attendance scan.",
            room = "A305"
        )

        val item = task.toReminderItem(testDate, zoneId)
        assertNotNull(item)
        assertEquals("systems-lab", item!!.id)
        assertEquals("Systems & AI · Lab 1", item.title)
        assertTrue(item.detail.contains("Room A305"))
        assertTrue(item.detail.contains("Go to A305"))
        assertEquals(511, item.triggerMinuteOfDay)
        assertEquals(520, item.startMinuteOfDay)
        assertEquals(600, item.endMinuteOfDay)
        assertEquals("2026-09-25", item.targetDate)
        assertEquals("class", item.kind)
        assertEquals("A305", item.room)
        assertTrue(item.notificationId > 0)
    }

    @Test
    fun testQuietTaskReturnsNull() {
        val quietTask = RoutineTask(
            id = "cooldown",
            title = "Your quiet hour",
            start = 1020,
            end = 1080,
            kind = "quiet",
            detail = "No reminders from 5:00–6:00 PM."
        )

        val item = quietTask.toReminderItem(testDate, zoneId)
        assertNull(item)
    }

    @Test
    fun testAcademicClassConversion() {
        val academicClass = AcademicClass(
            source = "NST",
            title = "Problem solving · Lab 1",
            time = "14:00 - 15:20",
            location = "A305",
            start = 840, // 2:00 PM
            topic = "Dynamic Programming",
            dateKey = "2026-09-25"
        )

        val item = academicClass.toReminderItem(testDate, zoneId)
        assertNotNull(item)
        assertEquals(831, item!!.triggerMinuteOfDay) // 9 minutes early
        assertEquals(840, item.startMinuteOfDay)
        assertTrue(item.detail.contains("Room A305"))
        assertTrue(item.detail.contains("Dynamic Programming"))
        assertTrue(item.detail.contains("Starts at 2:00 PM"))
        assertEquals("class", item.kind)
        assertEquals("A305", item.room)
        assertTrue(item.notificationId > 0)
    }

    @Test
    fun testClassFromAnotherDayIsNotScheduledToday() {
        val tomorrow = AcademicClass(
            source = "NST",
            title = "Tomorrow's class",
            time = "14:00 - 15:00",
            location = "A305",
            start = 840,
            dateKey = testDate.plusDays(1).toString()
        )
        assertNull(tomorrow.toReminderItem(testDate, zoneId))
    }

    @Test
    fun testQuietClassReturnsNull() {
        val lateClass = AcademicClass(
            source = "RUFP",
            title = "Ethics",
            time = "17:15 - 18:15",
            location = "A509",
            start = 1035 // 5:15 PM -> trigger is 1026 (inside 17:00-18:00)
        )

        val item = lateClass.toReminderItem(testDate, zoneId)
        assertNull(item)
    }

    @Test
    fun testMapSerializationRoundTrip() {
        val original = ReminderItem(
            id = "wake",
            title = "Wake up. Start fresh.",
            detail = "Drink hot water.",
            triggerMinuteOfDay = 295,
            startMinuteOfDay = 295,
            endMinuteOfDay = 305,
            targetDate = "2026-09-25",
            kind = "wake",
            room = null,
            triggerEpochMillis = 1790300000000L,
            notificationId = 42819
        )

        val map = original.toMap()
        val restored = ReminderItem.fromMap(map)

        assertNotNull(restored)
        assertEquals(original.id, restored!!.id)
        assertEquals(original.title, restored.title)
        assertEquals(original.detail, restored.detail)
        assertEquals(original.triggerMinuteOfDay, restored.triggerMinuteOfDay)
        assertEquals(original.startMinuteOfDay, restored.startMinuteOfDay)
        assertEquals(original.endMinuteOfDay, restored.endMinuteOfDay)
        assertEquals(original.targetDate, restored.targetDate)
        assertEquals(original.kind, restored.kind)
        assertEquals(original.room, restored.room)
        assertEquals(original.triggerEpochMillis, restored.triggerEpochMillis)
        assertEquals(original.notificationId, restored.notificationId)
    }

    @Test
    fun testTimeFormatting() {
        assertEquals("4:55 AM", ReminderItem.formatMinuteOfDay(295))
        assertEquals("8:40 AM", ReminderItem.formatMinuteOfDay(520))
        assertEquals("12:00 PM", ReminderItem.formatMinuteOfDay(720))
        assertEquals("1:00 PM", ReminderItem.formatMinuteOfDay(780))
        assertEquals("5:00 PM", ReminderItem.formatMinuteOfDay(1020))
        assertEquals("11:00 PM", ReminderItem.formatMinuteOfDay(1380))
        assertEquals("12:00 AM", ReminderItem.formatMinuteOfDay(0))
    }
}
