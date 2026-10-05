package com.example.uthjabsdk.feature.wakecalls.core

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager

/** The manifest filter accepts only Android's protected PHONE_STATE broadcast. */
class WakeCallPhoneStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == TelephonyManager.ACTION_PHONE_STATE_CHANGED) {
            WakeCallAudioController.restoreWhenIdle(
                context,
                intent.getStringExtra(TelephonyManager.EXTRA_STATE),
            )
        }
    }
}
