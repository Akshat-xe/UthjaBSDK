package com.example.uthjabsdk.feature.wakecalls.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalTime

class WakeCallSettingsTest {
    private val selected = setOf("+919876543210")

    @Test fun regularWindowHasInclusiveStartAndExclusiveEnd() {
        val settings = WakeCallSettings(true, 360, 480, 80, selected)
        assertFalse(settings.isActiveAt(LocalTime.of(5, 59)))
        assertTrue(settings.isActiveAt(LocalTime.of(6, 0)))
        assertTrue(settings.isActiveAt(LocalTime.of(7, 59)))
        assertFalse(settings.isActiveAt(LocalTime.of(8, 0)))
    }

    @Test fun windowCanCrossMidnight() {
        val settings = WakeCallSettings(true, 23 * 60, 6 * 60, 80, selected)
        assertTrue(settings.isActiveAt(LocalTime.of(23, 0)))
        assertTrue(settings.isActiveAt(LocalTime.of(0, 0)))
        assertTrue(settings.isActiveAt(LocalTime.of(5, 59)))
        assertFalse(settings.isActiveAt(LocalTime.of(12, 0)))
    }

    @Test fun disabledEmptyOrEqualWindowNeverChangesCalls() {
        assertFalse(WakeCallSettings(false, 360, 480, 80, selected).isActiveAt(LocalTime.of(7, 0)))
        assertFalse(WakeCallSettings(true, 360, 480, 80, emptySet()).isActiveAt(LocalTime.of(7, 0)))
        assertFalse(WakeCallSettings(true, 360, 360, 80, selected).isActiveAt(LocalTime.of(6, 0)))
    }

    @Test fun restoreNeverTrustsStaleIdleDuringRingingAndBoundsPermissionLoss() {
        var queried = false
        val staleIdle = { queried = true; true }
        assertFalse(shouldRestoreNow("RINGING", "IDLE", true, 10, 10, staleIdle))
        assertFalse(shouldRestoreNow("OFFHOOK", "IDLE", false, 10, 10, staleIdle))
        assertFalse(queried)
        assertTrue(shouldRestoreNow("IDLE", "IDLE", false, 0, 10, staleIdle))
        assertFalse(shouldRestoreNow(null, "IDLE", false, 9, 10, staleIdle))
        assertTrue(shouldRestoreNow(null, "IDLE", false, 10, 10, staleIdle))
        assertTrue(shouldRestoreNow(null, "IDLE", true, 0, 10, staleIdle))
    }
}
