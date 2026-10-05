package com.example.uthjabsdk.core.reminders

import com.example.uthjabsdk.core.sync.JsonParser
import java.io.File
import java.io.FileOutputStream

/**
 * Persisted state of the reminder scheduler.
 */
data class ReminderSchedulerState(
    val alarmsEnabled: Boolean = false,
    val targetDate: String = "",
    val updatedAtEpochMillis: Long = System.currentTimeMillis(),
    val reminders: List<ReminderItem> = emptyList()
)

/**
 * Atomic persistent storage for reminder scheduler state.
 * Survives process kills, device reboots, and date changes.
 */
class ReminderStateStorage(
    private val baseDir: File
) {
    private val storageDir = File(baseDir, "reminders").apply { mkdirs() }
    private val stateFile = File(storageDir, "reminder_state.json")
    private val tmpFile = File(storageDir, "reminder_state.json.tmp")

    @Synchronized
    fun save(state: ReminderSchedulerState): Boolean {
        return try {
            storageDir.mkdirs()
            val map = mapOf(
                "alarmsEnabled" to state.alarmsEnabled,
                "targetDate" to state.targetDate,
                "updatedAtEpochMillis" to state.updatedAtEpochMillis,
                "reminders" to state.reminders.map { it.toMap() }
            )
            val json = JsonParser.toJson(map)

            FileOutputStream(tmpFile).use { fos ->
                fos.write(json.toByteArray(Charsets.UTF_8))
                fos.flush()
                fos.fd.sync()
            }

            if (!tmpFile.renameTo(stateFile)) {
                tmpFile.copyTo(stateFile, overwrite = true)
                tmpFile.delete()
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    @Synchronized
    fun load(): ReminderSchedulerState? {
        if (!stateFile.exists() || !stateFile.canRead()) return null
        return try {
            val json = stateFile.readText(Charsets.UTF_8)
            val map = JsonParser.parseObject(json)

            val alarmsEnabled = map["alarmsEnabled"] as? Boolean ?: false
            val targetDate = map["targetDate"] as? String ?: ""
            val updatedAt = (map["updatedAtEpochMillis"] as? Number)?.toLong() ?: 0L

            @Suppress("UNCHECKED_CAST")
            val remindersRaw = map["reminders"] as? List<Map<String, Any?>> ?: emptyList()
            val reminders = remindersRaw.mapNotNull { ReminderItem.fromMap(it) }

            ReminderSchedulerState(
                alarmsEnabled = alarmsEnabled,
                targetDate = targetDate,
                updatedAtEpochMillis = updatedAt,
                reminders = reminders
            )
        } catch (_: Exception) {
            null
        }
    }

    @Synchronized
    fun isAlarmsEnabled(): Boolean {
        return load()?.alarmsEnabled ?: false
    }

    @Synchronized
    fun setAlarmsEnabled(enabled: Boolean): Boolean {
        val current = load() ?: ReminderSchedulerState()
        return save(current.copy(alarmsEnabled = enabled, updatedAtEpochMillis = System.currentTimeMillis()))
    }

    @Synchronized
    fun clear(): Boolean {
        return try {
            if (stateFile.exists()) stateFile.delete()
            if (tmpFile.exists()) tmpFile.delete()
            true
        } catch (_: Exception) {
            false
        }
    }
}
