package com.example.uthjabsdk.core.reminders

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.example.uthjabsdk.MainActivity

/**
 * Manages notification channel setup and notification dispatching for Uth ja BSDK reminders.
 */
object ReminderNotificationManager {

    const val CHANNEL_ID = "uthja_routine_reminders"
    const val CHANNEL_NAME = "Routine & Class Reminders"
    const val CHANNEL_DESCRIPTION = "Timely alerts for classes, daily rhythm, and study sessions."

    const val EXTRA_REMINDER_ID = "com.example.uthjabsdk.core.reminders.EXTRA_REMINDER_ID"
    const val EXTRA_REMINDER_DATE = "com.example.uthjabsdk.core.reminders.EXTRA_REMINDER_DATE"

    /**
     * Creates the notification channel on Android 8.0 (API 26) and above.
     * Safe to call multiple times (idempotent).
     */
    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                    ?: return

            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = CHANNEL_DESCRIPTION
                enableLights(true)
                lightColor = Color.rgb(46, 125, 50) // Forest green theme accent
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 150, 250)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    /**
     * Builds and posts a reminder notification for the given [ReminderItem].
     * Returns true if posted, false if suppressed by permission, quiet hours, or system error.
     */
    fun showReminderNotification(context: Context, item: ReminderItem): Boolean {
        // Enforce notification permission (Android 13+)
        if (!ReminderPermissionHelper.hasNotificationPermission(context)) {
            return false
        }

        // Enforce quiet hours (17:00 - 18:00)
        if (QuietHoursPolicy.shouldSuppressNow()) {
            return false
        }

        // Also ensure channel exists
        createNotificationChannel(context)

        // PendingIntent to launch MainActivity when tapped
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_REMINDER_ID, item.id)
            putExtra(EXTRA_REMINDER_DATE, item.targetDate)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            item.notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Select launcher icon or fallback
        val iconRes = try {
            val resId = context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName)
            if (resId != 0) resId else android.R.drawable.ic_dialog_info
        } catch (_: Exception) {
            android.R.drawable.ic_dialog_info
        }

        val subtext = when (item.kind) {
            "class" -> if (!item.room.isNullOrBlank()) "Class · ${item.room}" else "Class"
            "contest" -> "Contest"
            "meal" -> "Mess / Meal"
            "study" -> "Study Session"
            "packing" -> "Habit Checklist"
            else -> "Routine"
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(iconRes)
            .setContentTitle(item.title)
            .setContentText(item.detail)
            .setStyle(NotificationCompat.BigTextStyle().bigText(item.detail))
            .setSubText(subtext)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        return try {
            NotificationManagerCompat.from(context).notify(item.notificationId, builder.build())
            true
        } catch (_: SecurityException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Cancels an individual notification by ID.
     */
    fun cancelNotification(context: Context, notificationId: Int) {
        try {
            NotificationManagerCompat.from(context).cancel(notificationId)
        } catch (_: Exception) {
            // Ignore
        }
    }

    /**
     * Cancels all notifications posted by the app.
     */
    fun cancelAllNotifications(context: Context) {
        try {
            NotificationManagerCompat.from(context).cancelAll()
        } catch (_: Exception) {
            // Ignore
        }
    }
}
