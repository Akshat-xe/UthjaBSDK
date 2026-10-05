package com.example.uthjabsdk.core.reminders

import com.example.uthjabsdk.core.model.RoutineTask
import com.example.uthjabsdk.core.sync.PhoneActionStorage
import java.io.File
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * Provides static default daily routine and class schedule for any date.
 * Used during background reboot / time changes when DataSource is not yet active.
 */
object DefaultRoutineScheduleProvider {

    const val CONTEST_ANCHOR = "2026-09-18"

    fun getTasksForDate(dateKey: String, filesDir: File? = null): List<RoutineTask> {
        val date = try {
            LocalDate.parse(dateKey)
        } catch (_: Exception) {
            LocalDate.parse("2026-09-25")
        }
        val dayOfWeek = date.dayOfWeek.value // 1 (Mon) to 7 (Sun)
        val list = mutableListOf<RoutineTask>()

        // 1. Wake
        list.add(
            RoutineTask(
                id = "wake",
                title = "Wake up. Start fresh.",
                start = 295, // 4:55 AM
                end = 305,   // 5:05 AM
                kind = "wake",
                detail = "Drink hot water, put your phone on charge, and begin your morning."
            )
        )

        // 2. Freshen
        list.add(
            RoutineTask(
                id = "freshen",
                title = "Brush, freshen up & shower",
                start = 305, // 5:05 AM
                end = 345,   // 5:45 AM
                kind = "routine",
                detail = "Brush your teeth, use the bathroom, shower and change. Morning facial routine: besan cleanse and coconut oil."
            )
        )

        // 3. Morning study
        list.add(
            RoutineTask(
                id = "morning-study",
                title = "A quiet start",
                start = 345, // 5:45 AM
                end = 480,   // 8:00 AM
                kind = "study",
                detail = "Review yesterday’s notes, practise programming and get ready without rushing."
            )
        )

        // 4. Packing
        list.add(
            RoutineTask(
                id = "packing",
                title = "Pack your bag",
                start = 485, // 8:05 AM
                end = 505,   // 8:25 AM
                kind = "packing",
                detail = "Everything you need, checked once. Take your room key and lock the door."
            )
        )

        // 5. Breakfast
        list.add(
            RoutineTask(
                id = "breakfast",
                title = "Breakfast",
                start = 505, // 8:25 AM
                end = 510,   // 8:30 AM
                kind = "meal",
                detail = "Head to the Newton School mess. Your bag should already be packed."
            )
        )

        // Classes for date based on day of week
        val classes = getClassesForDate(dateKey, dayOfWeek)
        if (classes.isNotEmpty()) {
            list.add(
                RoutineTask(
                    id = "leave",
                    title = "Leave for campus",
                    start = 510, // 8:30 AM
                    end = 520,   // 8:40 AM
                    kind = "routine",
                    detail = "Leave the mess and head to campus. Check your first class and room below."
                )
            )
            list.addAll(classes)
        }

        // Lunch
        list.add(
            RoutineTask(
                id = "lunch",
                title = "Lunch & water",
                start = 780, // 1:00 PM
                end = 831,   // 1:51 PM
                kind = "meal",
                detail = "Have lunch, refill your water bottle and check the next classroom."
            )
        )

        // Cooldown / Quiet Hour (Kind = "quiet" -> suppressed by QuietHoursPolicy)
        list.add(
            RoutineTask(
                id = "cooldown",
                title = "Your quiet hour",
                start = 1020, // 5:00 PM
                end = 1080,   // 6:00 PM
                kind = "quiet",
                detail = "No reminders from 5:00–6:00 PM. Have your snacks and take a breather."
            )
        )

        // Evening choice
        list.add(
            RoutineTask(
                id = "evening",
                title = "Choose your evening",
                start = 1080, // 6:00 PM
                end = 1095,   // 6:15 PM
                kind = "choice",
                detail = "How was your day? Had your snacks? Choose Guided or Custom until 11:00 PM."
            )
        )

        // Study session 1
        val study1End = if (dayOfWeek in listOf(1, 3, 5)) 1170 else 1200
        list.add(
            RoutineTask(
                id = "study-one",
                title = "Study · first session",
                start = 1095, // 6:15 PM
                end = study1End,
                kind = "study",
                detail = "Go to your room, plug your phone in and start with your homework.",
                guided = true
            )
        )

        // Swimming on Mon, Wed, Fri
        if (dayOfWeek in listOf(1, 3, 5)) {
            list.add(
                RoutineTask(
                    id = "swim",
                    title = "Swimming",
                    start = 1170, // 7:30 PM
                    end = 1215,   // 8:15 PM
                    kind = "swim",
                    detail = "Take swimwear, towel, goggles, room key and a clean change. Head downstairs using the lift or stairs carefully.",
                    guided = true
                )
            )
        }

        // Study session 2
        list.add(
            RoutineTask(
                id = "study-two",
                title = "Study · finish strong",
                start = 1215, // 8:15 PM
                end = 1380,   // 11:00 PM
                kind = "study",
                detail = "Work through homework and prepare for the next class. Take dinner within the 8:00–9:30 PM window.",
                guided = true
            )
        )

        // Sleep
        list.add(
            RoutineTask(
                id = "sleep",
                title = "Time to sleep",
                start = 1380, // 11:00 PM
                end = 1440,   // 12:00 AM
                kind = "sleep",
                detail = "Put your phone away. Your next wake-up is 4:55 AM — a 5h 55m window."
            )
        )

        // Laundry drops/collections
        if (dayOfWeek == 1) { // Monday
            list.add(
                RoutineTask(
                    id = "laundry-drop",
                    title = "Drop off laundry",
                    start = 1010, // 4:50 PM
                    end = 1020,   // 5:00 PM
                    kind = "laundry",
                    detail = "Take the laundry bag and receipt. Monday drop-off → Thursday collection. Counter closes at 6:00 PM."
                )
            )
        }
        if (dayOfWeek == 4) { // Thursday
            list.add(
                RoutineTask(
                    id = "laundry-pick",
                    title = "Collect laundry",
                    start = 1010, // 4:50 PM
                    end = 1020,   // 5:00 PM
                    kind = "laundry",
                    detail = "Collect Monday’s laundry with your receipt. Return clean clothes to your wardrobe."
                )
            )
        }

        // Merge custom tasks if filesDir provided
        if (filesDir != null) {
            try {
                val phoneActionStorage = PhoneActionStorage(filesDir)
                val state = phoneActionStorage.load()
                if (state != null) {
                    val customForDate = state.customTasks.filter { it.date == null || it.date == dateKey }
                    val customIds = customForDate.map { it.id }.toSet()
                    list.removeAll { it.id in customIds }
                    list.addAll(customForDate)
                }
            } catch (_: Exception) {
                // Ignore storage read failures in background
            }
        }

        return list.sortedBy { it.start }
    }

    private fun getClassesForDate(dateKey: String, dayOfWeek: Int): List<RoutineTask> {
        val cls = { id: String, title: String, start: Int, end: Int, room: String ->
            RoutineTask(
                id = id,
                title = title,
                start = start,
                end = end,
                trigger = start - 9,
                kind = "class",
                detail = "Go to $room. Complete your campus facial attendance scan, then mark yourself present.",
                room = room,
                source = "PDF · page 4 · Section D / 4 / Lab 1"
            )
        }

        return when (dayOfWeek) {
            1 -> listOf(
                cls("systems-lab", "Systems & AI · Lab 1", 520, 600, "A305"),
                cls("communication", "Social Communication", 610, 670, "A509"),
                cls("programming-lab", "Problem solving · Lab 1", 840, 920, "A305"),
                cls("math-lab", "Mathematics I · Lab 1", 930, 1010, "A305")
            )
            2 -> listOf(
                cls("communication", "Social Communication", 610, 670, "A509"),
                cls("systems", "Systems & AI Essentials", 690, 770, "A507"),
                cls("programming", "Problem solving & programming", 840, 920, "A507"),
                cls("math", "Mathematics I", 930, 1010, "A507")
            )
            3 -> listOf(
                cls("systems-lab", "Systems & AI · Lab 1", 520, 600, "A305"),
                cls("society", "Self & Society", 610, 670, "Main Auditorium"),
                cls("programming-lab", "Problem solving · Lab 1", 840, 920, "A305"),
                cls("math-lab", "Mathematics I · Lab 1", 930, 1010, "A305")
            )
            4 -> listOf(
                cls("india", "Understanding India", 540, 670, "A509"),
                cls("systems", "Systems & AI Essentials", 690, 770, "A507"),
                cls("programming", "Problem solving & programming", 840, 920, "A507"),
                cls("math", "Mathematics I", 930, 1010, "A507")
            )
            5 -> {
                val contestSubject = getContestSubject(dateKey)
                listOf(
                    cls("india", "Understanding India", 540, 670, "A509"),
                    RoutineTask(
                        id = "contest",
                        title = "Contest · $contestSubject",
                        start = 840,
                        end = 990,
                        trigger = 831,
                        kind = "contest",
                        detail = "Go to Room to confirm. Complete self-reported contest score after finishing.",
                        room = "Room to confirm",
                        source = "PDF · page 4 · Section D / 4 / Lab 1"
                    )
                )
            }
            else -> emptyList()
        }
    }

    fun getContestSubject(dateKey: String): String {
        val anchor = LocalDate.parse(CONTEST_ANCHOR)
        val current = try { LocalDate.parse(dateKey) } catch (_: Exception) { anchor }
        val days = ChronoUnit.DAYS.between(anchor, current)
        val weeks = (days / 7).toInt()
        val subjects = listOf("Problem solving & programming", "Mathematics I", "Systems & AI")
        val index = ((weeks % 3) + 3) % 3
        return subjects[index]
    }
}
