package com.example.uthjabsdk.core.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver responsible for rescheduling reminders after device reboot,
 * time changes, timezone changes, date roll-overs, or package updates.
 */
class ReminderRescheduleReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "ReminderReschedule"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Received system broadcast: $action")

        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                val storage = ReminderStateStorage(context.filesDir)
                if (!storage.isAlarmsEnabled()) {
                    Log.d(TAG, "Alarms are disabled; ensuring all reminders are cancelled.")
                    AndroidReminderScheduler(context).cancelAll()
                    return
                }

                Log.i(TAG, "Alarms are enabled; rescheduling reminders for system event $action.")
                AndroidReminderScheduler(context).rescheduleOnSystemEvent()
            }
            else -> {
                Log.w(TAG, "Unhandled broadcast action: $action")
            }
        }
    }
}
