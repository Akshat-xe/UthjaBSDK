package com.example.uthjabsdk.feature.wakecalls.core

import android.Manifest
import android.content.pm.PackageManager
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telephony.PhoneNumberUtils
import android.telephony.TelephonyManager
import java.time.LocalTime
import java.util.Locale

class WakeCallScreeningService : CallScreeningService() {
    override fun onScreenCall(callDetails: Call.Details) {
        if (callDetails.callDirection != Call.Details.DIRECTION_INCOMING) return
        var silence = false
        try {
            if (WakeCallReadiness.inspect(this) == WakeCallStatus.READY) {
                val settings = WakeCallSettingsStore(this).load()
                val inWindow = settings.isActiveAt(LocalTime.now())
                val selected = inWindow && hasSelectedNumber(callDetails.handle?.schemeSpecificPart, settings)
                if (selected) WakeCallAudioController.prepareSelectedCall(this, settings.volumePercent)
                silence = inWindow && !selected
            }
        } catch (_: RuntimeException) {
            // Fail open within Telecom's five-second deadline.
        }
        // Keep the call visible in the dialer; only suppress its ringtone.
        respondToCall(
            callDetails,
            CallResponse.Builder().setSilenceCall(silence).build(),
        )
    }

    private fun hasSelectedNumber(incoming: String?, settings: WakeCallSettings): Boolean {
        if (incoming.isNullOrBlank() ||
            checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED
        ) return false
        val country = getSystemService(TelephonyManager::class.java)
            ?.networkCountryIso?.takeIf(String::isNotBlank)
            ?: Locale.getDefault().country.lowercase(Locale.ROOT)
        if (country.isBlank()) return false
        return settings.selectedNumbers.any { saved ->
            PhoneNumberUtils.areSamePhoneNumber(incoming, saved, country)
        }
    }
}
