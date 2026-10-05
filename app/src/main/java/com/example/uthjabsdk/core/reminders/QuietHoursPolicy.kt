package com.example.uthjabsdk.core.reminders

import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.RoutineTask
import java.time.LocalTime

/**
 * Policy enforcing quiet hours for Uth ja BSDK reminders.
 *
 * Rules:
 * 1. Quiet window: 17:00 to 18:00 (5:00 PM – 6:00 PM; minutes 1020 until 1080).
 *    Reminders must not trigger or notify during this window.
 * 2. Routine tasks with kind == "quiet" (such as "cooldown" / "Your quiet hour")
 *    are never scheduled for notifications.
 */
object QuietHoursPolicy {

    const val QUIET_START_HOUR = 17
    const val QUIET_START_MINUTE_OF_HOUR = 0
    const val QUIET_END_HOUR = 18
    const val QUIET_END_MINUTE_OF_HOUR = 0

    // 17 * 60 = 1020
    const val QUIET_START_MINUTE_OF_DAY = QUIET_START_HOUR * 60 + QUIET_START_MINUTE_OF_HOUR

    // 18 * 60 = 1080
    const val QUIET_END_MINUTE_OF_DAY = QUIET_END_HOUR * 60 + QUIET_END_MINUTE_OF_HOUR

    /**
     * Checks if a minute of day (0-1439) falls inside the 17:00..18:00 quiet window.
     * Note: 17:00 is quiet (inclusive), 18:00 is the end of quiet hour (exclusive).
     */
    fun isQuietMinute(minuteOfDay: Int): Boolean {
        return minuteOfDay in QUIET_START_MINUTE_OF_DAY until QUIET_END_MINUTE_OF_DAY
    }

    /**
     * Checks if a [LocalTime] falls within the quiet window.
     */
    fun isQuietTime(time: LocalTime): Boolean {
        val minuteOfDay = time.hour * 60 + time.minute
        return isQuietMinute(minuteOfDay)
    }

    /**
     * Checks if a [RoutineTask] is suppressed by the quiet policy.
     * Suppressed if kind is "quiet" OR if its trigger time falls in 17:00..18:00.
     */
    fun isQuietTask(task: RoutineTask): Boolean {
        if (task.kind.equals("quiet", ignoreCase = true)) {
            return true
        }
        return isQuietMinute(task.trigger)
    }

    /**
     * Checks if an [AcademicClass] trigger falls within the quiet window.
     * Classes trigger 9 minutes before class start time.
     */
    fun isQuietClass(academicClass: AcademicClass): Boolean {
        val triggerMinute = (academicClass.start - 9).coerceAtLeast(0)
        return isQuietMinute(triggerMinute)
    }

    /**
     * Validates whether a notification is permitted right now.
     */
    fun shouldSuppressNow(now: LocalTime = LocalTime.now()): Boolean {
        return isQuietTime(now)
    }
}
