package com.example.uthjabsdk.core.reminders

import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.RoutineTask
import java.time.LocalDate
import java.time.ZoneId

/**
 * Pure domain logic engine for computing, filtering, and ordering reminder items.
 * Independent of Android SDK framework classes, enabling fast JVM unit testing.
 */
object ReminderScheduleEngine {

    /**
     * Resolves and filters upcoming reminders for a given date.
     *
     * Rules enforced:
     * 1. If alarms are disabled, returns empty list.
     * 2. If target date is in the past, returns empty list.
     * 3. Drops any task/class matching [QuietHoursPolicy] (17:00 - 18:00 or kind == "quiet").
     * 4. Drops any completed task in [completedTaskIds].
     * 5. If [baseDate] is today, drops any reminder whose trigger time is in the past relative to [nowEpochMillis].
     * 6. Deduplicates items with matching IDs (preferring routine tasks over raw class entries).
     * 7. Returns items sorted by ascending trigger timestamp.
     */
    fun computeReminders(
        alarmsEnabled: Boolean,
        tasks: List<RoutineTask>,
        classes: List<AcademicClass> = emptyList(),
        baseDate: LocalDate,
        zoneId: ZoneId = ZoneId.systemDefault(),
        nowEpochMillis: Long = System.currentTimeMillis(),
        completedTaskIds: Set<String> = emptySet()
    ): List<ReminderItem> {
        if (!alarmsEnabled) {
            return emptyList()
        }

        val today = LocalDate.now(zoneId)
        if (baseDate.isBefore(today)) {
            return emptyList()
        }
        val isToday = baseDate.isEqual(today)

        val routineItems = tasks
            .filter { !completedTaskIds.contains(it.id) }
            .mapNotNull { it.toReminderItem(baseDate, zoneId) }

        val classItems = classes
            .mapNotNull { it.toReminderItem(baseDate, zoneId) }

        val itemMap = linkedMapOf<String, ReminderItem>()
        val seenKeys = mutableSetOf<String>()

        for (item in routineItems) {
            itemMap[item.id] = item
            val normKey = "${item.title.trim().lowercase()}_${item.startMinuteOfDay}"
            seenKeys.add(normKey)
        }

        for (item in classItems) {
            val normKey = "${item.title.trim().lowercase()}_${item.startMinuteOfDay}"
            if (!itemMap.containsKey(item.id) && !seenKeys.contains(normKey)) {
                itemMap[item.id] = item
                seenKeys.add(normKey)
            }
        }

        return itemMap.values.filter { item ->
            // Enforce quiet hours policy
            if (QuietHoursPolicy.isQuietMinute(item.triggerMinuteOfDay)) {
                return@filter false
            }
            if (item.kind.equals("quiet", ignoreCase = true)) {
                return@filter false
            }
            // If today, drop elapsed triggers
            if (isToday && item.triggerEpochMillis <= nowEpochMillis) {
                return@filter false
            }
            true
        }.sortedBy { it.triggerEpochMillis }
    }
}
