package com.example.uthjabsdk.core.sync

import com.example.uthjabsdk.core.model.DailyEventLog
import com.example.uthjabsdk.core.model.DayRecord
import com.example.uthjabsdk.core.model.FoodEntry
import com.example.uthjabsdk.core.model.LaundryRecord
import com.example.uthjabsdk.core.model.RoutineTask
import com.example.uthjabsdk.core.model.StudyNote
import com.example.uthjabsdk.core.model.TaskRecord
import com.example.uthjabsdk.core.model.WardrobeItem
import java.io.File
import java.io.FileOutputStream
import java.time.LocalDate

data class PhoneActionState(
    val currentDate: String = LocalDate.now().toString(),
    val alarmsEnabled: Boolean = false,
    val dayRecords: Map<String, DayRecord> = emptyMap(),
    val foodEntries: List<FoodEntry> = emptyList(),
    val wardrobe: List<WardrobeItem> = emptyList(),
    val studyNotes: List<StudyNote> = emptyList(),
    val radarFavorites: Set<String> = emptySet(),
    val radarProgress: Map<String, String> = emptyMap(),
    val eventLogs: List<DailyEventLog> = emptyList(),
    val customTasks: List<RoutineTask> = emptyList()
)

class PhoneActionStorage(
    private val baseDir: File
) {
    private val storageDir = File(baseDir, "phone_actions").apply { mkdirs() }
    private val actionsFile = File(storageDir, "phone_actions.json")
    private val tmpFile = File(storageDir, "phone_actions.json.tmp")

    @Synchronized
    fun save(state: PhoneActionState): Boolean {
        return try {
            val map = serializeState(state)
            val jsonString = JsonParser.toJson(map)

            storageDir.mkdirs()
            FileOutputStream(tmpFile).use { fos ->
                fos.write(jsonString.toByteArray(Charsets.UTF_8))
                fos.flush()
                fos.fd.sync()
            }

            if (!tmpFile.renameTo(actionsFile)) {
                tmpFile.copyTo(actionsFile, overwrite = true)
                tmpFile.delete()
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    @Synchronized
    fun load(): PhoneActionState? {
        if (!actionsFile.exists() || !actionsFile.canRead()) return null
        return try {
            val jsonString = actionsFile.readText(Charsets.UTF_8)
            val root = JsonParser.parseObject(jsonString)
            deserializeState(root)
        } catch (_: Exception) {
            null
        }
    }

    @Synchronized
    fun exportJson(): String? = load()?.let { JsonParser.toJson(serializeState(it)) }

    private fun serializeState(state: PhoneActionState): Map<String, Any?> {
        val root = mutableMapOf<String, Any?>()
        root["currentDate"] = state.currentDate
        root["alarmsEnabled"] = state.alarmsEnabled
        root["radarFavorites"] = state.radarFavorites.toList()
        root["radarProgress"] = state.radarProgress
        root["customTasks"] = state.customTasks.map { task ->
            mapOf(
                "id" to task.id, "title" to task.title, "start" to task.start,
                "end" to task.end, "trigger" to task.trigger, "kind" to task.kind,
                "detail" to task.detail, "room" to task.room, "source" to task.source,
                "guided" to task.guided, "hidden" to task.hidden, "date" to task.date
            )
        }

        // Day records
        val daysMap = mutableMapOf<String, Any?>()
        state.dayRecords.forEach { (dateKey, day) ->
            val dayObj = mutableMapOf<String, Any?>()
            dayObj["date"] = day.date
            dayObj["waterMl"] = day.waterMl
            dayObj["checks"] = day.checks
            dayObj["swimChecks"] = day.swimChecks
            dayObj["mode"] = day.mode
            dayObj["attendance"] = day.attendance
            dayObj["scores"] = day.scores
            dayObj["foodEntries"] = day.foodEntries.map { food ->
                mapOf("id" to food.id, "meal" to food.meal, "item" to food.item,
                    "amount" to food.amount, "at" to food.at)
            }

            // Done tasks
            val doneMap = mutableMapOf<String, Any?>()
            day.done.forEach { (taskId, rec) ->
                doneMap[taskId] = mapOf(
                    "at" to rec.at,
                    "recordedAt" to rec.recordedAt,
                    "status" to rec.status,
                    "verification" to rec.verification
                )
            }
            dayObj["done"] = doneMap

            if (day.laundry != null) {
                dayObj["laundry"] = mapOf(
                    "dropDate" to day.laundry.dropDate,
                    "dueDate" to day.laundry.dueDate,
                    "collectedAt" to day.laundry.collectedAt
                )
            }
            daysMap[dateKey] = dayObj
        }
        root["dayRecords"] = daysMap

        // Food entries
        root["foodEntries"] = state.foodEntries.map {
            mapOf(
                "id" to it.id,
                "meal" to it.meal,
                "item" to it.item,
                "amount" to it.amount,
                "at" to it.at
            )
        }

        // Wardrobe
        root["wardrobe"] = state.wardrobe.map {
            mapOf(
                "id" to it.id,
                "name" to it.name,
                "status" to it.status,
                "photoUrl" to it.photoUrl
            )
        }

        // Study notes
        root["studyNotes"] = state.studyNotes.map {
            mapOf(
                "id" to it.id,
                "subject" to it.subject,
                "text" to it.text,
                "date" to it.date,
                "done" to it.done,
                "photoUrl" to it.photoUrl
            )
        }

        // Event logs
        root["eventLogs"] = state.eventLogs.map {
            mapOf(
                "id" to it.id,
                "timestamp" to it.timestamp,
                "effectiveTime" to it.effectiveTime,
                "type" to it.type,
                "taskId" to it.taskId,
                "title" to it.title,
                "verification" to it.verification
            )
        }

        return root
    }

    @Suppress("UNCHECKED_CAST")
    private fun deserializeState(root: Map<String, Any?>): PhoneActionState {
        val currentDate = root["currentDate"] as? String ?: LocalDate.now().toString()
        val alarmsEnabled = root["alarmsEnabled"] as? Boolean ?: false

        val rawFavorites = root["radarFavorites"] as? List<Any?> ?: emptyList()
        val radarFavorites = rawFavorites.mapNotNull { it as? String }.toSet()

        val rawProgress = root["radarProgress"] as? Map<String, Any?> ?: emptyMap()
        val radarProgress = rawProgress.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }.toMap()
        val customTasks = (root["customTasks"] as? List<Any?>).orEmpty().mapNotNull { item ->
            val row = item as? Map<String, Any?> ?: return@mapNotNull null
            val id = row["id"] as? String ?: return@mapNotNull null
            val title = row["title"] as? String ?: return@mapNotNull null
            val kind = row["kind"] as? String ?: return@mapNotNull null
            val start = (row["start"] as? Number)?.toInt() ?: return@mapNotNull null
            val end = (row["end"] as? Number)?.toInt() ?: return@mapNotNull null
            if (start !in 0..1439 || end !in 0..1439) return@mapNotNull null
            RoutineTask(
                id = id, title = title, start = start, end = end,
                trigger = (row["trigger"] as? Number)?.toInt() ?: start,
                kind = kind, detail = row["detail"] as? String ?: "",
                room = row["room"] as? String, source = row["source"] as? String,
                guided = row["guided"] as? Boolean ?: false,
                hidden = row["hidden"] as? Boolean ?: false,
                date = row["date"] as? String
            )
        }

        // Days
        val dayRecords = mutableMapOf<String, DayRecord>()
        val rawDays = root["dayRecords"] as? Map<String, Any?> ?: emptyMap()
        rawDays.forEach { (dateKey, dayVal) ->
            val dayObj = dayVal as? Map<String, Any?> ?: return@forEach
            val date = dayObj["date"] as? String ?: dateKey
            val waterMl = (dayObj["waterMl"] as? Number)?.toInt() ?: 0
            val checks = (dayObj["checks"] as? List<Any?>)?.mapNotNull { (it as? Number)?.toInt() } ?: emptyList()
            val swimChecks = (dayObj["swimChecks"] as? List<Any?>)?.mapNotNull { (it as? Number)?.toInt() } ?: emptyList()
            val mode = dayObj["mode"] as? String
            val scores = (dayObj["scores"] as? Map<String, Any?>)?.mapNotNull { (k, v) ->
                (v as? Number)?.toFloat()?.let { k to it }
            }?.toMap() ?: emptyMap()
            val attendance = (dayObj["attendance"] as? Map<String, Any?>)?.mapNotNull { (k, v) ->
                (v as? String)?.let { k to it }
            }?.toMap() ?: emptyMap()
            val dayFoodEntries = (dayObj["foodEntries"] as? List<Any?>).orEmpty().mapNotNull { value ->
                val food = value as? Map<String, Any?> ?: return@mapNotNull null
                FoodEntry(
                    id = food["id"] as? String ?: return@mapNotNull null,
                    meal = food["meal"] as? String ?: "",
                    item = food["item"] as? String ?: "",
                    amount = food["amount"] as? String,
                    at = food["at"] as? String ?: ""
                )
            }

            val rawDone = dayObj["done"] as? Map<String, Any?> ?: emptyMap()
            val done = mutableMapOf<String, TaskRecord>()
            rawDone.forEach { (taskId, recVal) ->
                val recMap = recVal as? Map<String, Any?> ?: return@forEach
                done[taskId] = TaskRecord(
                    at = recMap["at"] as? String ?: "",
                    recordedAt = recMap["recordedAt"] as? String ?: "",
                    status = recMap["status"] as? String ?: "done",
                    verification = recMap["verification"] as? String ?: "manual"
                )
            }

            val laundryObj = dayObj["laundry"] as? Map<String, Any?>
            val laundry = laundryObj?.let {
                LaundryRecord(
                    dropDate = it["dropDate"] as? String ?: "",
                    dueDate = it["dueDate"] as? String ?: "",
                    collectedAt = it["collectedAt"] as? String
                )
            }

            dayRecords[dateKey] = DayRecord(
                date = date,
                done = done,
                checks = checks,
                waterMl = waterMl,
                mode = mode,
                attendance = attendance,
                scores = scores,
                swimChecks = swimChecks,
                foodEntries = dayFoodEntries,
                laundry = laundry
            )
        }

        // Food entries
        val rawFood = root["foodEntries"] as? List<Any?> ?: emptyList()
        val foodEntries = rawFood.mapNotNull {
            val f = it as? Map<String, Any?> ?: return@mapNotNull null
            FoodEntry(
                id = f["id"] as? String ?: "",
                meal = f["meal"] as? String ?: "",
                item = f["item"] as? String ?: "",
                amount = f["amount"] as? String,
                at = f["at"] as? String ?: ""
            )
        }

        // Wardrobe
        val rawWardrobe = root["wardrobe"] as? List<Any?> ?: emptyList()
        val wardrobe = rawWardrobe.mapNotNull {
            val w = it as? Map<String, Any?> ?: return@mapNotNull null
            WardrobeItem(
                id = w["id"] as? String ?: "",
                name = w["name"] as? String ?: "",
                status = w["status"] as? String ?: "Clean",
                photoUrl = w["photoUrl"] as? String
            )
        }

        // Study notes
        val rawNotes = root["studyNotes"] as? List<Any?> ?: emptyList()
        val studyNotes = rawNotes.mapNotNull {
            val n = it as? Map<String, Any?> ?: return@mapNotNull null
            StudyNote(
                id = n["id"] as? String ?: "",
                subject = n["subject"] as? String ?: "",
                text = n["text"] as? String ?: "",
                date = n["date"] as? String ?: "",
                done = n["done"] as? Boolean ?: false,
                photoUrl = n["photoUrl"] as? String
            )
        }

        // Event logs
        val rawLogs = root["eventLogs"] as? List<Any?> ?: emptyList()
        val eventLogs = rawLogs.mapNotNull {
            val l = it as? Map<String, Any?> ?: return@mapNotNull null
            DailyEventLog(
                id = l["id"] as? String ?: "",
                timestamp = l["timestamp"] as? String ?: "",
                effectiveTime = l["effectiveTime"] as? String ?: "",
                type = l["type"] as? String ?: "",
                taskId = l["taskId"] as? String,
                title = l["title"] as? String,
                verification = l["verification"] as? String
            )
        }

        return PhoneActionState(
            currentDate = currentDate,
            alarmsEnabled = alarmsEnabled,
            dayRecords = dayRecords,
            foodEntries = foodEntries,
            wardrobe = wardrobe,
            studyNotes = studyNotes,
            radarFavorites = radarFavorites,
            radarProgress = radarProgress,
            eventLogs = eventLogs,
            customTasks = customTasks
        )
    }
}
