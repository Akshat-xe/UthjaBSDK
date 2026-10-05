package com.example.uthjabsdk.feature.wakecalls.core

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalTime

data class WakeCallSettings(
    val enabled: Boolean = false,
    val startMinute: Int = 6 * 60,
    val endMinute: Int = 8 * 60,
    val volumePercent: Int = 100,
    val selectedNumbers: Set<String> = emptySet(),
)

/** Kept in noBackupFilesDir so contact numbers stay on this phone, outside cloud sync and backup. */
class WakeCallSettingsStore(context: Context) {
    private val file = AtomicFile(File(context.noBackupFilesDir, "wake_call_settings.json"))

    fun load(): WakeCallSettings = runCatching {
        val json = JSONObject(file.openRead().bufferedReader().use { it.readText() })
        WakeCallSettings(
            enabled = json.optBoolean("enabled"),
            startMinute = json.optInt("startMinute", 360).coerceIn(0, 1439),
            endMinute = json.optInt("endMinute", 480).coerceIn(0, 1439),
            volumePercent = json.optInt("volumePercent", 100).coerceIn(20, 100),
            selectedNumbers = json.optJSONArray("selectedNumbers")?.let { array ->
                (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) }.toSet()
            } ?: emptySet(),
        )
    }.getOrDefault(WakeCallSettings())

    fun save(settings: WakeCallSettings) {
        val json = JSONObject().apply {
            put("enabled", settings.enabled)
            put("startMinute", settings.startMinute.coerceIn(0, 1439))
            put("endMinute", settings.endMinute.coerceIn(0, 1439))
            put("volumePercent", settings.volumePercent.coerceIn(20, 100))
            put("selectedNumbers", JSONArray(settings.selectedNumbers.filter(String::isNotBlank).sorted()))
        }
        val output = file.startWrite()
        try {
            output.write(json.toString().toByteArray(Charsets.UTF_8))
            file.finishWrite(output)
        } catch (error: Exception) {
            file.failWrite(output)
            throw error
        }
    }
}

/** Inclusive start, exclusive end. Equal endpoints deliberately do not make a 24-hour window. */
internal fun WakeCallSettings.isActiveAt(time: LocalTime): Boolean {
    if (!enabled || startMinute == endMinute || selectedNumbers.isEmpty()) return false
    val minute = time.hour * 60 + time.minute
    return if (startMinute < endMinute) {
        minute in startMinute until endMinute
    } else {
        minute >= startMinute || minute < endMinute
    }
}
