package com.example.uthjabsdk.core.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver triggered by AlarmManager to post reminder notifications.
 */
class ReminderTriggerReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "ReminderTriggerReceiver"
        const val ACTION_REMINDER_TRIGGER = "com.example.uthjabsdk.core.reminders.ACTION_REMINDER_TRIGGER"

        const val EXTRA_ID = "REMINDER_ID"
        const val EXTRA_TITLE = "REMINDER_TITLE"
        const val EXTRA_DETAIL = "REMINDER_DETAIL"
        const val EXTRA_ROOM = "REMINDER_ROOM"
        const val EXTRA_KIND = "REMINDER_KIND"
        const val EXTRA_TRIGGER_MINUTE = "REMINDER_TRIGGER_MINUTE"
        const val EXTRA_START_MINUTE = "REMINDER_START_MINUTE"
        const val EXTRA_END_MINUTE = "REMINDER_END_MINUTE"
        const val EXTRA_TARGET_DATE = "REMINDER_TARGET_DATE"
        const val EXTRA_TRIGGER_EPOCH = "REMINDER_TRIGGER_EPOCH"
        const val EXTRA_NOTIFICATION_ID = "REMINDER_NOTIFICATION_ID"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != ACTION_REMINDER_TRIGGER) {
            Log.w(TAG, "Ignored unexpected action: $action")
            return
        }

        // 1. Check if alarms are currently enabled
        val storage = ReminderStateStorage(context.filesDir)
        if (!storage.isAlarmsEnabled()) {
            Log.d(TAG, "Alarms are disabled; suppressing reminder trigger.")
            return
        }

        // 2. Check quiet hours policy (17:00 - 18:00)
        if (QuietHoursPolicy.shouldSuppressNow()) {
            Log.d(TAG, "Current time is within 17:00-18:00 quiet hour; suppressing reminder.")
            return
        }

        val id = intent.getStringExtra(EXTRA_ID) ?: return
        val title = intent.getStringExtra(EXTRA_TITLE) ?: return
        val detail = intent.getStringExtra(EXTRA_DETAIL) ?: ""
        val room = intent.getStringExtra(EXTRA_ROOM)
        val kind = intent.getStringExtra(EXTRA_KIND) ?: "routine"
        val triggerMinute = intent.getIntExtra(EXTRA_TRIGGER_MINUTE, 0)
        val startMinute = intent.getIntExtra(EXTRA_START_MINUTE, triggerMinute)
        val endMinute = intent.getIntExtra(EXTRA_END_MINUTE, startMinute + 15)
        val targetDate = intent.getStringExtra(EXTRA_TARGET_DATE) ?: ""
        val triggerEpoch = intent.getLongExtra(EXTRA_TRIGGER_EPOCH, System.currentTimeMillis())
        val notificationId = intent.getIntExtra(
            EXTRA_NOTIFICATION_ID,
            ReminderItem.generateNotificationId(id, targetDate)
        )

        // 3. Double-check quiet kind and trigger minute
        if (kind.equals("quiet", ignoreCase = true) || QuietHoursPolicy.isQuietMinute(triggerMinute)) {
            Log.d(TAG, "Suppressed reminder for quiet item: $id ($triggerMinute)")
            return
        }

        val item = ReminderItem(
            id = id,
            title = title,
            detail = detail,
            triggerMinuteOfDay = triggerMinute,
            startMinuteOfDay = startMinute,
            endMinuteOfDay = endMinute,
            targetDate = targetDate,
            kind = kind,
            room = room,
            triggerEpochMillis = triggerEpoch,
            notificationId = notificationId
        )

        val posted = ReminderNotificationManager.showReminderNotification(context, item)
        Log.i(TAG, "Reminder '$title' posted = $posted (id=$notificationId)")
    }
}
