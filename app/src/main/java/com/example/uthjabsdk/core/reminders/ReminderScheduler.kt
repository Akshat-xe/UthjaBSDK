package com.example.uthjabsdk.core.reminders

import android.app.Activity
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.RoutineTask
import java.io.File
import java.time.LocalDate
import java.time.ZoneId

/**
 * Interface contract for scheduling, updating, and cancelling reminders.
 */
interface ReminderScheduler {

    /**
     * Schedules reminders for a list of routine tasks.
     * Filters out quiet hours (17:00-18:00), past tasks, and quiet tasks.
     */
    fun scheduleForTasks(
        tasks: List<RoutineTask>,
        baseDate: LocalDate = LocalDate.now(),
        alarmsEnabled: Boolean = true,
        completedTaskIds: Set<String> = emptySet()
    ): List<ReminderItem>

    /**
     * Schedules reminders for a list of academic classes.
     */
    fun scheduleForClasses(
        classes: List<AcademicClass>,
        baseDate: LocalDate = LocalDate.now(),
        alarmsEnabled: Boolean = true
    ): List<ReminderItem>

    /**
     * Synchronizes scheduled alarms with the current routine, classes, and enabled state.
     * If [alarmsEnabled] is false, cancels all scheduled alarms.
     */
    fun syncWithSchedule(
        alarmsEnabled: Boolean,
        tasks: List<RoutineTask>,
        classes: List<AcademicClass> = emptyList(),
        baseDate: LocalDate = LocalDate.now(),
        completedTaskIds: Set<String> = emptySet()
    ): List<ReminderItem>

    /**
     * Cancels all scheduled reminder alarms and dismisses active notifications.
     */
    fun cancelAll()

    /**
     * Cancels a single reminder by task ID and target date.
     */
    fun cancelReminder(taskId: String, dateKey: String = LocalDate.now().toString())

    /**
     * Callback when alarms toggle is triggered by the UI.
     */
    fun onAlarmsToggled(
        enabled: Boolean,
        tasks: List<RoutineTask>,
        classes: List<AcademicClass> = emptyList(),
        dateKey: String = LocalDate.now().toString()
    )

    /**
     * Callback when the active calendar date is changed in the UI.
     */
    fun onDateChanged(
        newDateKey: String,
        tasks: List<RoutineTask>,
        classes: List<AcademicClass> = emptyList(),
        alarmsEnabled: Boolean
    )

    /**
     * Callback when a task is completed, ensuring its pending alarm is safely removed.
     */
    fun onTaskCompleted(taskId: String, dateKey: String = LocalDate.now().toString())

    /**
     * Restores alarms on system events (reboot, time change, timezone change).
     */
    fun rescheduleOnSystemEvent()

    /**
     * Ensures the notification channel exists on Android 8.0+.
     */
    fun ensureNotificationChannel()

    /**
     * Checks if notification permission is granted on Android 13+.
     */
    fun hasNotificationPermission(): Boolean

    /**
     * Requests notification permission from an Activity.
     */
    fun requestNotificationPermission(activity: Activity, requestCode: Int = 1001)

    /**
     * Queries whether alarms are currently enabled.
     */
    fun isAlarmsEnabled(): Boolean
}

/**
 * Concrete Android implementation of [ReminderScheduler] using [AlarmManager],
 * avoiding exact-alarm special permissions by defaulting to [AlarmManager.setAndAllowWhileIdle].
 */
class AndroidReminderScheduler(
    private val context: Context,
    private val stateStorage: ReminderStateStorage = ReminderStateStorage(context.filesDir),
    private val zoneId: ZoneId = ZoneId.systemDefault()
) : ReminderScheduler {

    companion object {
        const val TAG = "AndroidReminderSched"
    }

    override fun scheduleForTasks(
        tasks: List<RoutineTask>,
        baseDate: LocalDate,
        alarmsEnabled: Boolean,
        completedTaskIds: Set<String>
    ): List<ReminderItem> {
        return syncWithSchedule(
            alarmsEnabled = alarmsEnabled,
            tasks = tasks,
            classes = emptyList(),
            baseDate = baseDate,
            completedTaskIds = completedTaskIds
        )
    }

    override fun scheduleForClasses(
        classes: List<AcademicClass>,
        baseDate: LocalDate,
        alarmsEnabled: Boolean
    ): List<ReminderItem> {
        return syncWithSchedule(
            alarmsEnabled = alarmsEnabled,
            tasks = emptyList(),
            classes = classes,
            baseDate = baseDate
        )
    }

    override fun syncWithSchedule(
        alarmsEnabled: Boolean,
        tasks: List<RoutineTask>,
        classes: List<AcademicClass>,
        baseDate: LocalDate,
        completedTaskIds: Set<String>
    ): List<ReminderItem> {
        val dateString = baseDate.toString()
        val today = LocalDate.now(zoneId)
        val isToday = baseDate.isEqual(today)
        val isPastDate = baseDate.isBefore(today)

        // 1. If alarms disabled or target date is in the past, cancel and clear
        if (!alarmsEnabled || isPastDate) {
            cancelAll()
            stateStorage.save(
                ReminderSchedulerState(
                    alarmsEnabled = alarmsEnabled,
                    targetDate = dateString,
                    updatedAtEpochMillis = System.currentTimeMillis(),
                    reminders = emptyList()
                )
            )
            return emptyList()
        }

        // 2. Cancel existing scheduled alarms before arming new set
        val existingState = stateStorage.load()
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        if (alarmManager != null && existingState != null) {
            for (oldItem in existingState.reminders) {
                val pi = createPendingIntent(oldItem)
                alarmManager.cancel(pi)
                pi.cancel()
            }
        }

        // 3. Compute reminder items using pure ReminderScheduleEngine
        val validItems = ReminderScheduleEngine.computeReminders(
            alarmsEnabled = alarmsEnabled,
            tasks = tasks,
            classes = classes,
            baseDate = baseDate,
            zoneId = zoneId,
            nowEpochMillis = System.currentTimeMillis(),
            completedTaskIds = completedTaskIds
        )

        // 4. Arm alarms in AlarmManager
        if (alarmManager != null) {
            for (item in validItems) {
                armAlarm(alarmManager, item)
            }
        }

        // 5. Persist state
        val newState = ReminderSchedulerState(
            alarmsEnabled = true,
            targetDate = dateString,
            updatedAtEpochMillis = System.currentTimeMillis(),
            reminders = validItems
        )
        stateStorage.save(newState)
        Log.i(TAG, "Synced reminders: ${validItems.size} items armed for $dateString")

        return validItems
    }

    override fun cancelAll() {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        val existingState = stateStorage.load()
        if (alarmManager != null && existingState != null) {
            for (item in existingState.reminders) {
                val pi = createPendingIntent(item)
                alarmManager.cancel(pi)
                pi.cancel()
            }
        }
        stateStorage.save(
            ReminderSchedulerState(
                alarmsEnabled = false,
                targetDate = "",
                updatedAtEpochMillis = System.currentTimeMillis(),
                reminders = emptyList()
            )
        )
        ReminderNotificationManager.cancelAllNotifications(context)
        Log.i(TAG, "All reminders cancelled and dismissed.")
    }

    override fun cancelReminder(taskId: String, dateKey: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        val existingState = stateStorage.load() ?: return
        val itemToCancel = existingState.reminders.find { it.id == taskId && it.targetDate == dateKey }
        if (itemToCancel != null) {
            if (alarmManager != null) {
                val pi = createPendingIntent(itemToCancel)
                alarmManager.cancel(pi)
                pi.cancel()
            }
            ReminderNotificationManager.cancelNotification(context, itemToCancel.notificationId)
            val updatedList = existingState.reminders.filterNot { it.id == taskId && it.targetDate == dateKey }
            stateStorage.save(existingState.copy(reminders = updatedList))
            Log.d(TAG, "Cancelled individual reminder: $taskId")
        }
    }

    override fun onAlarmsToggled(
        enabled: Boolean,
        tasks: List<RoutineTask>,
        classes: List<AcademicClass>,
        dateKey: String
    ) {
        val targetDate = try { LocalDate.parse(dateKey) } catch (_: Exception) { LocalDate.now() }
        syncWithSchedule(
            alarmsEnabled = enabled,
            tasks = tasks,
            classes = classes,
            baseDate = targetDate
        )
    }

    override fun onDateChanged(
        newDateKey: String,
        tasks: List<RoutineTask>,
        classes: List<AcademicClass>,
        alarmsEnabled: Boolean
    ) {
        val targetDate = try { LocalDate.parse(newDateKey) } catch (_: Exception) { LocalDate.now() }
        syncWithSchedule(
            alarmsEnabled = alarmsEnabled,
            tasks = tasks,
            classes = classes,
            baseDate = targetDate
        )
    }

    override fun onTaskCompleted(taskId: String, dateKey: String) {
        cancelReminder(taskId, dateKey)
    }

    override fun rescheduleOnSystemEvent() {
        val isEnabled = isAlarmsEnabled()
        if (!isEnabled) {
            cancelAll()
            return
        }

        val today = LocalDate.now(zoneId)
        val todayString = today.toString()
        val tasks = DefaultRoutineScheduleProvider.getTasksForDate(todayString, context.filesDir)

        syncWithSchedule(
            alarmsEnabled = true,
            tasks = tasks,
            classes = emptyList(),
            baseDate = today
        )
    }

    override fun ensureNotificationChannel() {
        ReminderNotificationManager.createNotificationChannel(context)
    }

    override fun hasNotificationPermission(): Boolean {
        return ReminderPermissionHelper.hasNotificationPermission(context)
    }

    override fun requestNotificationPermission(activity: Activity, requestCode: Int) {
        ReminderPermissionHelper.requestNotificationPermission(activity, requestCode)
    }

    override fun isAlarmsEnabled(): Boolean {
        return stateStorage.isAlarmsEnabled()
    }

    /**
     * Safely arms an alarm using setAndAllowWhileIdle, or setExactAndAllowWhileIdle
     * if exact scheduling capability is explicitly permitted.
     * Prevents any SecurityException or exact alarm permission restrictions.
     */
    private fun armAlarm(alarmManager: AlarmManager, item: ReminderItem) {
        val pi = createPendingIntent(item)
        val triggerMillis = item.triggerEpochMillis

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarmManager.canScheduleExactAlarms()) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMillis, pi)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMillis, pi)
            } else {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerMillis, pi)
            }
        } catch (_: SecurityException) {
            // Safe fallback: avoid requiring exact alarm special permission
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMillis, pi)
                } else {
                    alarmManager.set(AlarmManager.RTC_WAKEUP, triggerMillis, pi)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to arm alarm for ${item.id}: ${e.message}")
            }
        }
    }

    private fun createPendingIntent(item: ReminderItem): PendingIntent {
        val intent = Intent(context, ReminderTriggerReceiver::class.java).apply {
            action = ReminderTriggerReceiver.ACTION_REMINDER_TRIGGER
            putExtra(ReminderTriggerReceiver.EXTRA_ID, item.id)
            putExtra(ReminderTriggerReceiver.EXTRA_TITLE, item.title)
            putExtra(ReminderTriggerReceiver.EXTRA_DETAIL, item.detail)
            putExtra(ReminderTriggerReceiver.EXTRA_ROOM, item.room)
            putExtra(ReminderTriggerReceiver.EXTRA_KIND, item.kind)
            putExtra(ReminderTriggerReceiver.EXTRA_TRIGGER_MINUTE, item.triggerMinuteOfDay)
            putExtra(ReminderTriggerReceiver.EXTRA_START_MINUTE, item.startMinuteOfDay)
            putExtra(ReminderTriggerReceiver.EXTRA_END_MINUTE, item.endMinuteOfDay)
            putExtra(ReminderTriggerReceiver.EXTRA_TARGET_DATE, item.targetDate)
            putExtra(ReminderTriggerReceiver.EXTRA_TRIGGER_EPOCH, item.triggerEpochMillis)
            putExtra(ReminderTriggerReceiver.EXTRA_NOTIFICATION_ID, item.notificationId)
        }

        return PendingIntent.getBroadcast(
            context,
            item.notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
