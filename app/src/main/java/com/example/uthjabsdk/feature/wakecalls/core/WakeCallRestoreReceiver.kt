package com.example.uthjabsdk.feature.wakecalls.core

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WakeCallRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> WakeCallAudioController.restoreAfterBoot(context)
            ACTION_RECOVER, Intent.ACTION_MY_PACKAGE_REPLACED ->
                WakeCallAudioController.restoreWhenIdle(context)
        }
    }

    companion object {
        const val ACTION_RECOVER = "com.example.uthjabsdk.WAKE_CALL_RECOVER"
    }
}
