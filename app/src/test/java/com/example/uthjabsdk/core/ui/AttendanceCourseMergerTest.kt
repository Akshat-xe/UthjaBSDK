package com.example.uthjabsdk.core.ui

import com.example.uthjabsdk.core.sync.SnapshotSubject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AttendanceCourseMergerTest {
    private fun row(name: String, group: String, attended: Int, total: Int) = SnapshotSubject(
        name = name,
        group = group,
        code = "",
        attended = attended,
        total = total,
        percent = if (total > 0) attended * 100f / total else 0f
    )

    @Test fun combinesOnlyTheThreeCrossSourcePairsWithWeightedCounts() {
        val result = mergeAttendanceCourses(listOf(
            row("S&AI - D", "NST Core", 11, 13),
            row("Maths I - D", "NST Core", 9, 13),
            row("PSP - D", "NST Core", 11, 13),
            row("Self and Society I", "RUF Foundation", 5, 6),
            row("Mathematics I", "RUF Foundation", 9, 14),
            row("Social Communication I", "RUF Foundation", 11, 14),
            row("Understanding India", "RUF Foundation", 8, 10),
            row("Problem Solving and Programming", "RUF Foundation", 11, 16),
            row("System and AI Essentials", "RUF Foundation", 11, 14)
        ))

        assertEquals(6, result.size)
        assertEquals(86, result.sumOf { it.attended })
        assertEquals(113, result.sumOf { it.total })
        val math = result.single { it.name == "Mathematics I + Lab 1" }
        assertEquals(18, math.attended)
        assertEquals(27, math.total)
        assertEquals(66.7f, math.percent, 0.1f)
        assertEquals(9, math.needAttend)
        assertEquals(0, math.canMiss)
        assertEquals("NST 9/13 · RUFP 9/14", math.breakdown)
        val problem = result.single { it.name == "Problem Solving + Lab 1" }
        assertEquals(22, problem.attended)
        assertEquals(29, problem.total)
        assertEquals(75.9f, problem.percent, 0.1f)
        assertEquals(0, problem.canMiss)
        val systems = result.single { it.name == "Systems & AI + Lab 1" }
        assertEquals(22, systems.attended)
        assertEquals(27, systems.total)
        assertEquals(81.5f, systems.percent, 0.1f)
        assertEquals(2, systems.canMiss)
        assertEquals(listOf("Self and Society I", "Social Communication I", "Understanding India"),
            result.filter { it.group == "RUF Foundation" }.map { it.name })
    }

    @Test fun preservesUnmatchedAndAmbiguousCoursesInsteadOfGuessing() {
        val lone = row("Maths I - D", "NST Core", 2, 3)
        val rufp = row("Mathematics I", "RUF Foundation", 3, 4)
        val extra = row("Maths I Lab 1 - D", "NST Core", 1, 2)
        val unrelated = row("Mathematics II", "RUF Foundation", 4, 5)
        val result = mergeAttendanceCourses(listOf(lone, rufp, extra, unrelated))
        assertEquals(4, result.size)
        assertEquals(listOf(lone.name, rufp.name, extra.name, unrelated.name), result.map { it.name })
        assertNull(result[0].breakdown)
    }

    @Test fun handlesAlternateCampusGroupAndNameWhitespace() {
        val result = mergeAttendanceCourses(listOf(
            row(" PSP   Lab 1 - D ", "NST Core", 0, 0),
            row("Problem Solving and Programming", "RUFP Foundation", 3, 4)
        ))
        assertEquals(1, result.size)
        assertEquals(75f, result.single().percent, 0f)
        assertEquals(0, result.single().needAttend)
    }
}
