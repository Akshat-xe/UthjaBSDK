package com.example.uthjabsdk.core.reminders

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.nio.file.Files

class ReminderStateStorageTest {

    private lateinit var tempDir: File
    private lateinit var storage: ReminderStateStorage

    @Before
    fun setup() {
        tempDir = Files.createTempDirectory("uthja_reminders_test").toFile()
        storage = ReminderStateStorage(tempDir)
    }

    @After
    fun tearDown() {
        tempDir.deleteRecursively()
    }

    @Test
    fun testEmptyStorageReturnsNull() {
        assertNull(storage.load())
        assertFalse(storage.isAlarmsEnabled())
    }

    @Test
    fun testSaveAndLoadState() {
        val item = ReminderItem(
            id = "systems-lab",
            title = "Systems & AI · Lab 1",
            detail = "Room A305",
            triggerMinuteOfDay = 511,
            startMinuteOfDay = 520,
            endMinuteOfDay = 600,
            targetDate = "2026-09-25",
            kind = "class",
            room = "A305",
            triggerEpochMillis = 1790300000000L,
            notificationId = 1001
        )

        val state = ReminderSchedulerState(
            alarmsEnabled = true,
            targetDate = "2026-09-25",
            updatedAtEpochMillis = 1790300000000L,
            reminders = listOf(item)
        )

        assertTrue(storage.save(state))
        assertTrue(storage.isAlarmsEnabled())

        val loaded = storage.load()
        assertNotNull(loaded)
        assertTrue(loaded!!.alarmsEnabled)
        assertEquals("2026-09-25", loaded.targetDate)
        assertEquals(1, loaded.reminders.size)
        assertEquals("systems-lab", loaded.reminders[0].id)
        assertEquals(511, loaded.reminders[0].triggerMinuteOfDay)
    }

    @Test
    fun testSetAlarmsEnabledToggle() {
        assertFalse(storage.isAlarmsEnabled())

        storage.setAlarmsEnabled(true)
        assertTrue(storage.isAlarmsEnabled())

        storage.setAlarmsEnabled(false)
        assertFalse(storage.isAlarmsEnabled())
    }

    @Test
    fun testClearRemovesFiles() {
        val state = ReminderSchedulerState(alarmsEnabled = true, targetDate = "2026-09-25")
        storage.save(state)
        assertTrue(storage.isAlarmsEnabled())

        storage.clear()
        assertFalse(storage.isAlarmsEnabled())
        assertNull(storage.load())
    }
}
