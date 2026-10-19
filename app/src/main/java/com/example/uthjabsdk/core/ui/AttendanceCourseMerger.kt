package com.example.uthjabsdk.core.ui

import com.example.uthjabsdk.core.model.CourseAttendance
import com.example.uthjabsdk.core.sync.SnapshotSubject

/** Combines the three campus course pairs for display without changing source or overall totals. */
internal fun mergeAttendanceCourses(subjects: List<SnapshotSubject>): List<CourseAttendance> {
    fun source(group: String): String? = when (group.trim().lowercase()) {
        "nst core" -> "NST"
        "ruf foundation", "rufp foundation" -> "RUFP"
        else -> null
    }

    fun family(subject: SnapshotSubject): String? {
        val name = subject.name.trim().lowercase().replace(Regex("\\s+"), " ")
        return when (source(subject.group)) {
            "NST" -> when (name) {
                "maths i - d", "maths i lab 1 - d", "mathematics i - d", "mathematics i lab 1 - d" -> "math"
                "psp - d", "psp lab 1 - d" -> "problem"
                "s&ai - d", "s&ai lab 1 - d" -> "systems"
                else -> null
            }
            "RUFP" -> when (name) {
                "mathematics i" -> "math"
                "problem solving and programming" -> "problem"
                "system and ai essentials", "systems and ai essentials" -> "systems"
                else -> null
            }
            else -> null
        }
    }

    fun raw(subject: SnapshotSubject) = CourseAttendance(
        name = subject.name,
        code = subject.code,
        group = subject.group,
        attended = subject.attended,
        total = subject.total,
        percent = subject.percent,
        canMiss = subject.canMiss,
        needAttend = subject.needAttend
    )

    val indexed = subjects.withIndex().groupBy { indexed ->
        val src = source(indexed.value.group)
        val key = family(indexed.value)
        if (src != null && key != null) key to src else null
    }
    val labels = mapOf(
        "math" to "Mathematics I + Lab 1",
        "problem" to "Problem Solving + Lab 1",
        "systems" to "Systems & AI + Lab 1"
    )
    val pairs = labels.keys.mapNotNull { key ->
        val nst = indexed[key to "NST"].orEmpty()
        val rufp = indexed[key to "RUFP"].orEmpty()
        if (nst.size == 1 && rufp.size == 1) key to (nst.single() to rufp.single()) else null
    }.toMap()
    val secondIndices = pairs.values.map { it.second.index }.toSet()

    return subjects.mapIndexedNotNull { index, subject ->
        if (index in secondIndices) return@mapIndexedNotNull null
        val pair = pairs[family(subject)]
        if (pair == null || pair.first.index != index) return@mapIndexedNotNull raw(subject)
        val nst = pair.first.value
        val rufp = pair.second.value
        val attended = nst.attended + rufp.attended
        val total = nst.total + rufp.total
        val surplus = 4 * attended - 3 * total
        CourseAttendance(
            name = labels.getValue(family(subject)!!),
            code = listOf(nst.code, rufp.code).filter { it.isNotBlank() }.joinToString(" + "),
            group = "Combined course",
            attended = attended,
            total = total,
            percent = if (total > 0) attended * 100f / total else 0f,
            canMiss = (surplus / 3).coerceAtLeast(0),
            needAttend = (-surplus).coerceAtLeast(0),
            breakdown = "NST ${nst.attended}/${nst.total} · RUFP ${rufp.attended}/${rufp.total}"
        )
    }
}
