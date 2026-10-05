package com.example.uthjabsdk.core.reminders

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Utility helper for notification and alarm permissions on Android 13+ (API 33+).
 */
object ReminderPermissionHelper {

    const val NOTIFICATION_PERMISSION_REQUEST_CODE = 4001

    /**
     * Checks if the app has permission to post notifications.
     * On Android 13+ (API 33+), checks [Manifest.permission.POST_NOTIFICATIONS].
     * On older versions, checks [NotificationManagerCompat.areNotificationsEnabled].
     */
    fun hasNotificationPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            NotificationManagerCompat.from(context).areNotificationsEnabled()
        }
    }

    /**
     * Requests notification permission from the given [Activity] if targeting Android 13+
     * and not yet granted.
     */
    fun requestNotificationPermission(
        activity: Activity,
        requestCode: Int = NOTIFICATION_PERMISSION_REQUEST_CODE
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!hasNotificationPermission(activity)) {
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    requestCode
                )
            }
        }
    }

    /**
     * Checks whether exact alarms can be scheduled without requiring exact-alarm special permission.
     * Returns true if supported and allowed, false otherwise.
     */
    fun canScheduleExactAlarms(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            alarmManager?.canScheduleExactAlarms() ?: false
        } else {
            true
        }
    }
}
