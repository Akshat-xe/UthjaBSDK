package com.example.uthjabsdk.feature.wakecalls.core

import android.Manifest
import android.app.NotificationManager
import android.app.role.RoleManager
import android.content.Context
import android.content.pm.PackageManager

enum class WakeCallStatus {
    READY,
    CONTACTS_PERMISSION,
    PHONE_STATE_PERMISSION,
    CALL_SCREENING_ROLE,
    POLICY_ACCESS,
    PAUSED_BY_DND,
}

object WakeCallReadiness {
    fun inspect(context: Context): WakeCallStatus {
        if (context.checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            return WakeCallStatus.CONTACTS_PERMISSION
        }
        if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            return WakeCallStatus.PHONE_STATE_PERMISSION
        }
        val roles = context.getSystemService(RoleManager::class.java)
        if (roles?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) != true) {
            return WakeCallStatus.CALL_SCREENING_ROLE
        }
        val notifications = context.getSystemService(NotificationManager::class.java)
        if (notifications?.isNotificationPolicyAccessGranted != true) {
            return WakeCallStatus.POLICY_ACCESS
        }
        // On Android 15+ a regular app cannot relax a separate active DND rule.
        if (notifications.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL) {
            return WakeCallStatus.PAUSED_BY_DND
        }
        return WakeCallStatus.READY
    }
}
