package com.example.uthjabsdk.core.reminders

import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.RoutineTask
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.util.Locale

/**
 * Normalized reminder model representing an upcoming event scheduled for notification.
 */
data class ReminderItem(
    val id: String,
    val title: String,
    val detail: String,
    val triggerMinuteOfDay: Int,
    val startMinuteOfDay: Int,
    val endMinuteOfDay: Int,
    val targetDate: String, // YYYY-MM-DD
    val kind: String,
    val room: String? = null,
    val triggerEpochMillis: Long,
    val notificationId: Int
) {
    fun toMap(): Map<String, Any?> {
        return mapOf(
            "id" to id,
            "title" to title,
            "detail" to detail,
            "triggerMinuteOfDay" to triggerMinuteOfDay,
            "startMinuteOfDay" to startMinuteOfDay,
            "endMinuteOfDay" to endMinuteOfDay,
            "targetDate" to targetDate,
            "kind" to kind,
            "room" to room,
            "triggerEpochMillis" to triggerEpochMillis,
            "notificationId" to notificationId
        )
    }

    companion object {
        fun fromMap(map: Map<String, Any?>): ReminderItem? {
            return try {
                val id = map["id"] as? String ?: return null
                val title = map["title"] as? String ?: return null
                val detail = map["detail"] as? String ?: ""
                val triggerMinute = (map["triggerMinuteOfDay"] as? Number)?.toInt() ?: return null
                val startMinute = (map["startMinuteOfDay"] as? Number)?.toInt() ?: triggerMinute
                val endMinute = (map["endMinuteOfDay"] as? Number)?.toInt() ?: (startMinute + 15)
                val targetDate = map["targetDate"] as? String ?: return null
                val kind = map["kind"] as? String ?: "routine"
                val room = map["room"] as? String
                val triggerEpochMillis = (map["triggerEpochMillis"] as? Number)?.toLong() ?: return null
                val notificationId = (map["notificationId"] as? Number)?.toInt()
                    ?: generateNotificationId(id, targetDate)

                ReminderItem(
                    id = id,
                    title = title,
                    detail = detail,
                    triggerMinuteOfDay = triggerMinute,
                    startMinuteOfDay = startMinute,
                    endMinuteOfDay = endMinute,
                    targetDate = targetDate,
                    kind = kind,
                    room = room,
                    triggerEpochMillis = triggerEpochMillis,
                    notificationId = notificationId
                )
            } catch (_: Exception) {
                null
            }
        }

        fun generateNotificationId(id: String, targetDate: String): Int {
            val combined = "$id|$targetDate"
            val hash = combined.hashCode() and 0x7FFFFFFF
            return if (hash == 0) 1 else hash
        }

        fun formatMinuteOfDay(minuteOfDay: Int): String {
            val clamped = minuteOfDay.coerceIn(0, 1439)
            val hour = clamped / 60
            val min = clamped % 60
            val amPm = if (hour < 12) "AM" else "PM"
            val displayHour = when {
                hour == 0 -> 12
                hour > 12 -> hour - 12
                else -> hour
            }
            return String.format(Locale.US, "%d:%02d %s", displayHour, min, amPm)
        }
    }
}

/**
 * Extension to convert [RoutineTask] into a [ReminderItem].
 * Returns null if the task is suppressed by [QuietHoursPolicy].
 */
fun RoutineTask.toReminderItem(
    targetDate: LocalDate,
    zoneId: ZoneId = ZoneId.systemDefault()
): ReminderItem? {
    if (QuietHoursPolicy.isQuietTask(this)) return null

    val triggerMinute = trigger.coerceIn(0, 1439)
    val hour = triggerMinute / 60
    val minute = triggerMinute % 60
    val ldt = LocalDateTime.of(targetDate, LocalTime.of(hour, minute))
    val epochMillis = ldt.atZone(zoneId).toInstant().toEpochMilli()
    val dateString = targetDate.toString()
    val notifId = ReminderItem.generateNotificationId(id, dateString)

    val enrichedDetail = buildString {
        if (!room.isNullOrBlank()) {
            append("Room ").append(room).append(" · ")
        }
        append(detail)
    }

    return ReminderItem(
        id = id,
        title = title,
        detail = enrichedDetail,
        triggerMinuteOfDay = triggerMinute,
        startMinuteOfDay = start,
        endMinuteOfDay = end,
        targetDate = dateString,
        kind = kind,
        room = room,
        triggerEpochMillis = epochMillis,
        notificationId = notifId
    )
}

/**
 * Extension to convert [AcademicClass] into a [ReminderItem].
 * Alerts 9 minutes before class start. Returns null if suppressed by [QuietHoursPolicy].
 */
fun AcademicClass.toReminderItem(
    targetDate: LocalDate,
    zoneId: ZoneId = ZoneId.systemDefault()
): ReminderItem? {
    if (dateKey.isNotBlank() && dateKey != targetDate.toString()) return null
    val triggerMinute = (start - 9).coerceIn(0, 1439)
    if (QuietHoursPolicy.isQuietMinute(triggerMinute)) return null

    val hour = triggerMinute / 60
    val minute = triggerMinute % 60
    val ldt = LocalDateTime.of(targetDate, LocalTime.of(hour, minute))
    val epochMillis = ldt.atZone(zoneId).toInstant().toEpochMilli()
    val dateString = targetDate.toString()
    val sanitizedTitle = title.replace("\\s+".toRegex(), "_")
    val classId = "class_${source}_${sanitizedTitle}_$start"
    val notifId = ReminderItem.generateNotificationId(classId, dateString)

    val detailText = buildString {
        if (location.isNotBlank()) append("Room $location · ")
        append("Starts at ${ReminderItem.formatMinuteOfDay(start)}")
        if (!topic.isNullOrBlank()) append(" · $topic")
    }

    return ReminderItem(
        id = classId,
        title = title,
        detail = detailText,
        triggerMinuteOfDay = triggerMinute,
        startMinuteOfDay = start,
        endMinuteOfDay = (start + 50).coerceAtMost(1439),
        targetDate = dateString,
        kind = "class",
        room = location,
        triggerEpochMillis = epochMillis,
        notificationId = notifId
    )
}
