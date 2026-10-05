package com.example.uthjabsdk.core.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DefaultRoutineScheduleProviderTest {

    @Test
    fun testMondayClassesAndSchedule() {
        val tasks = DefaultRoutineScheduleProvider.getTasksForDate("2026-09-14") // Monday
        val classes = tasks.filter { it.kind == "class" }

        // Expected 4 classes on Monday
        assertEquals(4, classes.size)
        assertEquals("Systems & AI · Lab 1", classes[0].title)
        assertEquals("A305", classes[0].room)
        assertEquals(520, classes[0].start)
        assertEquals(511, classes[0].trigger)

        assertEquals("Social Communication", classes[1].title)
        assertEquals("A509", classes[1].room)

        assertEquals("Problem solving · Lab 1", classes[2].title)
        assertEquals("A305", classes[2].room)

        assertEquals("Mathematics I · Lab 1", classes[3].title)
        assertEquals("A305", classes[3].room)

        // Monday laundry drop
        val laundry = tasks.find { it.id == "laundry-drop" }
        assertNotNull(laundry)
        assertEquals(1010, laundry!!.start)

        // Cooldown quiet hour task
        val cooldown = tasks.find { it.id == "cooldown" }
        assertNotNull(cooldown)
        assertEquals(1020, cooldown!!.start)
        assertEquals(1080, cooldown.end)
        assertEquals("quiet", cooldown.kind)
        assertTrue(QuietHoursPolicy.isQuietTask(cooldown))
    }

    @Test
    fun testFridayContestRotation() {
        // Week 0: Problem solving & programming
        assertEquals(
            "Problem solving & programming",
            DefaultRoutineScheduleProvider.getContestSubject("2026-09-18")
        )

        // Week 1: Mathematics I
        assertEquals(
            "Mathematics I",
            DefaultRoutineScheduleProvider.getContestSubject("2026-09-25")
        )

        // Week 2: Systems & AI
        assertEquals(
            "Systems & AI",
            DefaultRoutineScheduleProvider.getContestSubject("2026-10-02")
        )
    }

    @Test
    fun testWeekendScheduleHasNoClasses() {
        val saturdayTasks = DefaultRoutineScheduleProvider.getTasksForDate("2026-09-19")
        val sundayTasks = DefaultRoutineScheduleProvider.getTasksForDate("2026-09-20")

        assertEquals(0, saturdayTasks.count { it.kind == "class" || it.kind == "contest" })
        assertEquals(0, sundayTasks.count { it.kind == "class" || it.kind == "contest" })
    }
}
