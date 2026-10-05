package com.example.uthjabsdk.core.reminders

import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.RoutineTask
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalTime

class QuietHoursPolicyTest {

    @Test
    fun testExactMinuteBoundaries() {
        // 17:00 is minute 1020
        // 18:00 is minute 1080
        assertEquals(1020, QuietHoursPolicy.QUIET_START_MINUTE_OF_DAY)
        assertEquals(1080, QuietHoursPolicy.QUIET_END_MINUTE_OF_DAY)

        // 16:59 (1019) -> NOT quiet
        assertFalse(QuietHoursPolicy.isQuietMinute(1019))

        // 17:00 (1020) -> QUIET
        assertTrue(QuietHoursPolicy.isQuietMinute(1020))

        // 17:30 (1050) -> QUIET
        assertTrue(QuietHoursPolicy.isQuietMinute(1050))

        // 17:59 (1079) -> QUIET
        assertTrue(QuietHoursPolicy.isQuietMinute(1079))

        // 18:00 (1080) -> NOT quiet (quiet hour ends, evening starts)
        assertFalse(QuietHoursPolicy.isQuietMinute(1080))

        // 18:01 (1081) -> NOT quiet
        assertFalse(QuietHoursPolicy.isQuietMinute(1081))
    }

    @Test
    fun testLocalTimeEvaluation() {
        assertFalse(QuietHoursPolicy.isQuietTime(LocalTime.of(16, 59)))
        assertTrue(QuietHoursPolicy.isQuietTime(LocalTime.of(17, 0)))
        assertTrue(QuietHoursPolicy.isQuietTime(LocalTime.of(17, 30)))
        assertTrue(QuietHoursPolicy.isQuietTime(LocalTime.of(17, 59)))
        assertFalse(QuietHoursPolicy.isQuietTime(LocalTime.of(18, 0)))
        assertFalse(QuietHoursPolicy.isQuietTime(LocalTime.of(8, 30)))
    }

    @Test
    fun testRoutineTaskKindQuietSuppression() {
        // Task explicitly marked kind = "quiet" is suppressed regardless of time
        val cooldownTask = RoutineTask(
            id = "cooldown",
            title = "Your quiet hour",
            start = 1020,
            end = 1080,
            kind = "quiet",
            detail = "No reminders from 5:00–6:00 PM."
        )
        assertTrue(QuietHoursPolicy.isQuietTask(cooldownTask))

        val morningQuiet = RoutineTask(
            id = "morning-quiet",
            title = "Meditation",
            start = 360,
            end = 390,
            kind = "quiet",
            detail = "Silent time"
        )
        assertTrue(QuietHoursPolicy.isQuietTask(morningQuiet))
    }

    @Test
    fun testRoutineTaskDuringQuietHourSuppression() {
        // Normal task whose trigger falls inside 17:00 - 18:00
        val snackTask = RoutineTask(
            id = "evening-snack",
            title = "Mess Snacks",
            start = 1040, // 5:20 PM
            end = 1060,
            trigger = 1035, // 5:15 PM
            kind = "meal",
            detail = "Snack in quiet hour"
        )
        assertTrue(QuietHoursPolicy.isQuietTask(snackTask))

        // Task before quiet hour
        val laundryTask = RoutineTask(
            id = "laundry-drop",
            title = "Drop off laundry",
            start = 1010, // 4:50 PM
            end = 1020,
            trigger = 1010,
            kind = "laundry",
            detail = "Drop clothes before quiet hour"
        )
        assertFalse(QuietHoursPolicy.isQuietTask(laundryTask))

        // Task at 18:00 (evening start)
        val eveningChoice = RoutineTask(
            id = "evening",
            title = "Choose your evening",
            start = 1080, // 6:00 PM
            end = 1095,
            trigger = 1080,
            kind = "choice",
            detail = "How was your day?"
        )
        assertFalse(QuietHoursPolicy.isQuietTask(eveningChoice))
    }

    @Test
    fun testAcademicClassTriggerEvaluation() {
        // Class at 17:20 starts at 1040, trigger is 1040 - 9 = 1031 (inside quiet hour)
        val quietClass = AcademicClass(
            source = "NST",
            title = "Late Seminar",
            time = "17:20 - 18:20",
            location = "A305",
            start = 1040
        )
        assertTrue(QuietHoursPolicy.isQuietClass(quietClass))

        // Normal class at 08:40 (minute 520) triggers at 511 (08:31 AM)
        val morningClass = AcademicClass(
            source = "NST",
            title = "Systems & AI · Lab 1",
            time = "08:40 - 10:00",
            location = "A305",
            start = 520
        )
        assertFalse(QuietHoursPolicy.isQuietClass(morningClass))
    }
}
