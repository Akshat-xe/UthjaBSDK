package com.example.uthjabsdk

import android.content.ComponentName
import android.content.ContextWrapper
import android.content.pm.ApplicationInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.uthjabsdk.feature.wakecalls.core.WakeCallPhoneStateReceiver
import com.example.uthjabsdk.feature.wakecalls.core.WakeCallRestoreReceiver
import com.example.uthjabsdk.feature.wakecalls.core.WakeCallScreeningService
import com.example.uthjabsdk.feature.wakecalls.core.WakeCallSettings
import com.example.uthjabsdk.feature.wakecalls.core.WakeCallSettingsStore
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WakeCallDeviceConfigurationTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun sensitiveAppDataIsNotEligibleForAutomaticBackup() {
        val info = context.packageManager.getApplicationInfo(context.packageName, 0)
        assertEquals(0, info.flags and ApplicationInfo.FLAG_ALLOW_BACKUP)
    }

    @Test
    fun telecomEntryPointIsProtectedAndRecoveryReceiverIsPrivate() {
        val manager = context.packageManager
        val screening = manager.getServiceInfo(ComponentName(context, WakeCallScreeningService::class.java), 0)
        assertEquals("android.permission.BIND_SCREENING_SERVICE", screening.permission)
        assertTrue(manager.getReceiverInfo(ComponentName(context, WakeCallPhoneStateReceiver::class.java), 0).exported)
        assertFalse(manager.getReceiverInfo(ComponentName(context, WakeCallRestoreReceiver::class.java), 0).exported)
    }

    @Test
    fun selectedNumbersStayInPrivateNoBackupStorage() {
        val testDir = File(context.cacheDir, "wake-call-device-test").apply { mkdirs() }
        val isolated = object : ContextWrapper(context) {
            override fun getNoBackupFilesDir(): File = testDir
        }
        try {
            val saved = WakeCallSettings(
                enabled = true,
                startMinute = 6 * 60 + 30,
                endMinute = 9 * 60 + 30,
                volumePercent = 80,
                selectedNumbers = setOf("+15551234567"),
            )
            WakeCallSettingsStore(isolated).save(saved)
            assertEquals(saved, WakeCallSettingsStore(isolated).load())
            assertTrue(File(testDir, "wake_call_settings.json").isFile)
        } finally {
            testDir.deleteRecursively()
        }
    }
}
