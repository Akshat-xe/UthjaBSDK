package com.example.uthjabsdk.feature.wakecalls.core

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.SystemClock
import android.telephony.TelephonyManager
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import kotlin.math.roundToInt

internal object WakeCallAudioController {
    private const val RECOVERY_DELAY_MS = 3 * 60 * 1000L
    private const val MAX_PERMISSIONLESS_RECOVERY_ATTEMPTS = 10
    private const val REQUEST_CODE = 9427

    private data class OriginalAudio(
        val ringerMode: Int,
        val ringVolume: Int,
        val permissionlessRecoveryAttempts: Int = 0,
    )

    @Synchronized
    fun prepareSelectedCall(context: Context, percent: Int): Boolean {
        val app = context.applicationContext
        val audio = app.getSystemService(AudioManager::class.java) ?: return false
        val notification = app.getSystemService(NotificationManager::class.java) ?: return false
        // Without policy access Android may reject silent/vibrate -> normal with SecurityException.
        if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL &&
            !notification.isNotificationPolicyAccessGranted
        ) return false

        return try {
            if (readOriginal(app) == null) {
                writeOriginal(
                    app,
                    OriginalAudio(
                        ringerMode = audio.ringerMode,
                        ringVolume = audio.getStreamVolume(AudioManager.STREAM_RING),
                    ),
                )
            }
            audio.ringerMode = AudioManager.RINGER_MODE_NORMAL
            val max = audio.getStreamMaxVolume(AudioManager.STREAM_RING)
            val desired = ((max * percent.coerceIn(20, 100) / 100f).roundToInt()).coerceIn(1, max)
            audio.setStreamVolume(AudioManager.STREAM_RING, desired, 0)
            if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL ||
                audio.getStreamVolume(AudioManager.STREAM_RING) == 0
            ) {
                restore(app)
                false
            } else {
                scheduleRecovery(app)
                true
            }
        } catch (_: SecurityException) {
            restore(app)
            false
        } catch (_: RuntimeException) {
            restore(app)
            false
        }
    }

    @Synchronized
    fun restoreWhenIdle(context: Context, state: String? = null) {
        val app = context.applicationContext
        val original = readOriginal(app) ?: return
        // A call-state query can lag behind a RINGING/OFFHOOK broadcast. Never let a stale IDLE
        // reading undo the volume change before the selected call begins ringing.
        val canReadState = hasPhoneStatePermission(app)
        val attempts = original.permissionlessRecoveryAttempts + 1
        if (shouldRestoreNow(
                state,
                TelephonyManager.EXTRA_STATE_IDLE,
                canReadState,
                attempts,
                MAX_PERMISSIONLESS_RECOVERY_ATTEMPTS,
            ) { isIdle(app) }
        ) {
            restore(app)
            return
        }
        // A revoked permission removes both the state broadcast and our ability to query calls.
        // Retry for a bounded period, then restore so the phone is not left loud indefinitely.
        if (state == null && !canReadState) {
            writeOriginal(app, original.copy(permissionlessRecoveryAttempts = attempts))
        }
        scheduleRecovery(app)
    }

    @Synchronized
    fun restoreAfterBoot(context: Context) {
        // A reboot ends every call, so restoring the saved audio state is safe without phone access.
        restore(context.applicationContext)
    }

    private fun hasPhoneStatePermission(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED

    private fun isIdle(context: Context): Boolean {
        return runCatching {
            context.getSystemService(TelephonyManager::class.java)?.callState == TelephonyManager.CALL_STATE_IDLE
        }.getOrDefault(false)
    }

    private fun originalFile(context: Context) =
        AtomicFile(File(context.noBackupFilesDir, "wake_call_original_audio.json"))

    private fun readOriginal(context: Context): OriginalAudio? = runCatching {
        val json = JSONObject(originalFile(context).openRead().bufferedReader().use { it.readText() })
        OriginalAudio(
            json.getInt("ringerMode"),
            json.getInt("ringVolume"),
            json.optInt("permissionlessRecoveryAttempts", 0),
        )
    }.getOrNull()

    private fun writeOriginal(context: Context, original: OriginalAudio) {
        val file = originalFile(context)
        val output = file.startWrite()
        try {
            val bytes = JSONObject()
                .put("ringerMode", original.ringerMode)
                .put("ringVolume", original.ringVolume)
                .put("permissionlessRecoveryAttempts", original.permissionlessRecoveryAttempts)
                .toString().toByteArray(Charsets.UTF_8)
            output.write(bytes)
            file.finishWrite(output)
        } catch (error: Exception) {
            file.failWrite(output)
            throw error
        }
    }

    private fun restore(context: Context) {
        val original = readOriginal(context) ?: return
        val audio = context.getSystemService(AudioManager::class.java) ?: return
        try {
            audio.ringerMode = AudioManager.RINGER_MODE_NORMAL
            audio.setStreamVolume(AudioManager.STREAM_RING, original.ringVolume, 0)
            audio.ringerMode = original.ringerMode
            originalFile(context).delete()
            context.getSystemService(AlarmManager::class.java)?.cancel(recoveryIntent(context))
        } catch (_: SecurityException) {
            scheduleRecovery(context)
        } catch (_: RuntimeException) {
            scheduleRecovery(context)
        }
    }

    private fun recoveryIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context,
        REQUEST_CODE,
        Intent(context, WakeCallRestoreReceiver::class.java).setAction(WakeCallRestoreReceiver.ACTION_RECOVER),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun scheduleRecovery(context: Context) {
        context.getSystemService(AlarmManager::class.java)?.setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + RECOVERY_DELAY_MS,
            recoveryIntent(context),
        )
    }
}

internal fun shouldRestoreNow(
    state: String?,
    idleState: String,
    canReadState: Boolean,
    permissionlessAttempts: Int,
    maxPermissionlessAttempts: Int,
    isIdle: () -> Boolean,
): Boolean = when {
    state != null -> state == idleState
    canReadState -> isIdle()
    else -> permissionlessAttempts >= maxPermissionlessAttempts
}
