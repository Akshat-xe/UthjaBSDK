package com.example.uthjabsdk.core.reminders

import android.app.Activity
import android.content.Context
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.RoutineTask
import com.example.uthjabsdk.core.ui.UthJaBsdkDataSource
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * Narrow integration API for wiring Uth ja BSDK Reminder Scheduler
 * into MainActivity and RealUthJaBsdkDataSource.
 *
 * =========================================================================
 * INTEGRATION GUIDE FOR CODEX:
 * =========================================================================
 *
 * OPTION 1: Automatic Lifecycle Binding (Recommended for MainActivity.kt)
 * In MainActivity.onCreate():
 * ```kotlin
 * val reminderScheduler = ReminderIntegration.createScheduler(applicationContext)
 * reminderScheduler.ensureNotificationChannel()
 * reminderScheduler.requestNotificationPermission(this)
 * ReminderIntegration.bindToDataSource(
 *     activity = this,
 *     dataSource = dataSource,
 *     scheduler = reminderScheduler
 * )
 * ```
 *
 * OPTION 2: Direct Hooking in RealUthJaBsdkDataSource.kt
 * Pass [ReminderScheduler] into constructor or instantiate in dataSource:
 * 1. In toggleAlarms():
 * ```kotlin
 * override fun toggleAlarms() {
 *     _alarmsEnabled.value = !_alarmsEnabled.value
 *     persistPhoneActions()
 *     reminderScheduler.onAlarmsToggled(
 *         enabled = _alarmsEnabled.value,
 *         tasks = getTasksForDate(_currentDate.value),
 *         classes = _weeklyClasses.value,
 *         dateKey = _currentDate.value
 *     )
 * }
 * ```
 * 2. In setDate(dateKey):
 * ```kotlin
 * reminderScheduler.onDateChanged(
 *     newDateKey = dateKey,
 *     tasks = getTasksForDate(dateKey),
 *     classes = _weeklyClasses.value,
 *     alarmsEnabled = _alarmsEnabled.value
 * )
 * ```
 * 3. In completeTask(task):
 * ```kotlin
 * reminderScheduler.onTaskCompleted(task.id, _currentDate.value)
 * ```
 * =========================================================================
 */
object ReminderIntegration {

    /**
     * Factory method creating the default Android reminder scheduler.
     */
    fun createScheduler(context: Context): ReminderScheduler {
        return AndroidReminderScheduler(context.applicationContext)
    }

    /**
     * Automatically binds the reminder scheduler to reactive flows in [UthJaBsdkDataSource].
     * Keeps today's alarms in sync with the enabled flag, completed tasks and classes.
     * Browsing another date in the UI must not cancel today's alarms.
     */
    fun bindToDataSource(
        activity: ComponentActivity,
        dataSource: UthJaBsdkDataSource,
        scheduler: ReminderScheduler = createScheduler(activity.applicationContext)
    ) {
        scheduler.ensureNotificationChannel()

        activity.lifecycleScope.launch {
            activity.repeatOnLifecycle(Lifecycle.State.STARTED) {
                combine(
                    dataSource.alarmsEnabled,
                    dataSource.allDays,
                    dataSource.weeklyClasses,
                    dataSource.tasksRevision
                ) { alarmsEnabled, allDays, classes, _ ->
                    Triple(alarmsEnabled, allDays, classes)
                }.collectLatest { (alarmsEnabled, allDays, classes) ->
                    val baseDate = LocalDate.now()
                    val todayKey = baseDate.toString()
                    val tasks = dataSource.getTasksForDate(todayKey)
                    val completedIds = allDays[todayKey]?.done?.keys ?: emptySet()

                    scheduler.syncWithSchedule(
                        alarmsEnabled = alarmsEnabled,
                        tasks = tasks,
                        classes = classes,
                        baseDate = baseDate,
                        completedTaskIds = completedIds
                    )
                }
            }
        }
    }

    /**
     * Direct callback helper when alarms are toggled in data source.
     */
    fun onAlarmsToggled(
        scheduler: ReminderScheduler,
        alarmsEnabled: Boolean,
        tasks: List<RoutineTask>,
        classes: List<AcademicClass> = emptyList(),
        dateKey: String = LocalDate.now().toString()
    ) {
        scheduler.onAlarmsToggled(alarmsEnabled, tasks, classes, dateKey)
    }

    /**
     * Direct callback helper when active calendar date changes.
     */
    fun onDateChanged(
        scheduler: ReminderScheduler,
        newDateKey: String,
        tasks: List<RoutineTask>,
        classes: List<AcademicClass> = emptyList(),
        alarmsEnabled: Boolean
    ) {
        scheduler.onDateChanged(newDateKey, tasks, classes, alarmsEnabled)
    }

    /**
     * Direct callback helper when a task is completed.
     */
    fun onTaskCompleted(
        scheduler: ReminderScheduler,
        taskId: String,
        dateKey: String = LocalDate.now().toString()
    ) {
        scheduler.onTaskCompleted(taskId, dateKey)
    }
}
