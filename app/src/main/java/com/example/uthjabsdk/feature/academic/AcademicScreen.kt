package com.example.uthjabsdk.feature.academic

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.uthjabsdk.core.design.CheckSquare
import com.example.uthjabsdk.core.design.DaySelectorStrip
import com.example.uthjabsdk.core.design.EyebrowBadge
import com.example.uthjabsdk.core.design.ForestAccent
import com.example.uthjabsdk.core.design.ForestDarkText
import com.example.uthjabsdk.core.design.ForestGreen
import com.example.uthjabsdk.core.design.ForestLine
import com.example.uthjabsdk.core.design.ForestMuted
import com.example.uthjabsdk.core.design.ForestPanel
import com.example.uthjabsdk.core.design.ForestPanel2
import com.example.uthjabsdk.core.design.ForestPeach
import com.example.uthjabsdk.core.design.ForestText
import com.example.uthjabsdk.core.design.GlassPanel
import com.example.uthjabsdk.core.design.SegmentTabs
import com.example.uthjabsdk.core.design.StatusDanger
import com.example.uthjabsdk.core.design.StatusGood
import com.example.uthjabsdk.core.design.StatusWarning
import com.example.uthjabsdk.core.design.Typography
import com.example.uthjabsdk.core.design.UthJaIcons
import com.example.uthjabsdk.core.model.AcademicClass
import com.example.uthjabsdk.core.model.AcademicMailItem
import com.example.uthjabsdk.core.model.AcademicSummary
import com.example.uthjabsdk.core.model.CourseAttendance
import com.example.uthjabsdk.core.model.StudyNote
import com.example.uthjabsdk.core.model.SyncSourceStateStatus
import com.example.uthjabsdk.core.ui.UthJaBsdkDataSource
import java.time.LocalDate

/**
 * AcademicScreen: Complete native implementation of Uth ja BSDK Academic views:
 * - NST Timetable (Daily & 5-day week overview)
 * - Course Attendance (Aggregated metrics + individual course cards)
 * - Academic Mail (Campus notices, priorities, snippets, and action items)
 * - Study Notes & Homework (Queue + thought capture form)
 */
@Composable
fun AcademicScreen(
    dataSource: UthJaBsdkDataSource,
    initialTab: String = "timetable", // "timetable", "attendance", "mail", "notes"
    onShowToast: (String, (() -> Unit)?) -> Unit = { _, _ -> }
) {
    var selectedSubTab by remember { mutableStateOf(initialTab) }
    val currentDate by dataSource.currentDate.collectAsState()
    val summary by dataSource.academicSummary.collectAsState()
    val syncStatus by dataSource.syncState.collectAsState()
    val courses by dataSource.courseAttendances.collectAsState()
    val emails by dataSource.academicMails.collectAsState()
    val notes by dataSource.studyNotes.collectAsState()
    val todayStr = remember { LocalDate.now().toString() }
    val academicSourcesReady = listOf("newton", "rishiverse").all {
        syncStatus.sources[it]?.status == SyncSourceStateStatus.SUCCESS
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Heading
        Column {
            EyebrowBadge(text = "AKSHAT’S WORKSPACE")
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = when (selectedSubTab) {
                    "attendance" -> "Course Attendance"
                    "mail" -> "Academic Mail"
                    "notes" -> "Study Notes & Homework"
                    else -> "Academic Timetable"
                },
                style = Typography.headlineLarge
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = when (selectedSubTab) {
                    "attendance" -> "Track NST Core, RUFP Foundation, and 75% minimum criteria."
                    "mail" -> "Official campus notices, faculty communications, and announcements."
                    "notes" -> "Capture homework now. It will be here when you sit down to study."
                    else -> "Section D · Group 4 · Lab 1 · NST and RUFP classes together."
                },
                style = Typography.bodyMedium.copy(color = ForestMuted)
            )
        }

        // Snapshot Status & Sync trigger Banner
        GlassPanel(backgroundColor = ForestPanel2) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (academicSourcesReady) StatusGood else StatusWarning)
                    )
                    Column {
                        Text(
                            text = summary.importedAt?.let { "Snapshot updated $it" }
                                ?: "No academic snapshot imported yet",
                            style = Typography.titleMedium.copy(fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        )
                        Text(
                            text = if (academicSourcesReady) "Stored on this device · ${summary.semester}"
                                else "NST or RUFP needs setup; saved values may be stale",
                            style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp)
                        )
                    }
                }

                Button(
                    onClick = { dataSource.triggerSync() },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ForestAccent,
                        contentColor = ForestDarkText
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Text("Sync ↻", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ForestDarkText)
                }
            }
        }

        // Subtabs Selector
        SegmentTabs(
            tabs = listOf(
                "timetable" to "Timetable",
                "attendance" to "Attendance",
                "mail" to "Mail",
                "notes" to "Notes"
            ),
            selectedKey = selectedSubTab,
            onTabSelect = { selectedSubTab = it },
            modifier = Modifier.fillMaxWidth()
        )

        // Subtab Content
        when (selectedSubTab) {
            "timetable" -> TimetableTabContent(
                dataSource = dataSource,
                currentDate = currentDate,
                todayStr = todayStr,
                onShowToast = onShowToast
            )
            "attendance" -> AttendanceTabContent(
                summary = summary,
                courses = courses
            )
            "mail" -> MailTabContent(
                emails = emails
            )
            "notes" -> NotesTabContent(
                notes = notes,
                onToggleNote = { id ->
                    dataSource.toggleStudyNote(id)
                    onShowToast("Note status updated", null)
                },
                onAddNote = { subject, text ->
                    dataSource.addStudyNote(subject, text, null)
                    onShowToast("Saved note for $subject", null)
                }
            )
        }
    }
}

/**
 * Timetable Subtab
 */
@Composable
private fun TimetableTabContent(
    dataSource: UthJaBsdkDataSource,
    currentDate: String,
    todayStr: String,
    onShowToast: (String, (() -> Unit)?) -> Unit
) {
    val tasksRevision by dataSource.tasksRevision.collectAsState()
    val weeklyDays = remember(currentDate) { dataSource.getWeeklyTimetable(currentDate) }
    val dailyTasks = remember(currentDate, tasksRevision) {
        dataSource.getTasksForDate(currentDate).filter { it.kind == "class" || it.kind == "contest" }
    }
    val currentDay by dataSource.currentDay.collectAsState()

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Week strip
        DaySelectorStrip(
            selectedDate = currentDate,
            todayDate = todayStr,
            onDateSelect = { dataSource.setDate(it) }
        )

        // Academic Term Indicator
        GlassPanel(backgroundColor = ForestPanel2) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    EyebrowBadge(text = "ACADEMIC TERM")
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Semester 1 · In progress",
                        style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                }
                Text(
                    text = "15 Aug 2026 – 14 Feb 2027",
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )
            }
        }

        // Selected Day Classes
        GlassPanel {
            Text(
                text = "Selected day's classes (PDF · page 4)",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(12.dp))

            if (dailyTasks.isEmpty()) {
                Text(
                    text = "No classes scheduled in the PDF timetable for this date. Enjoy the space.",
                    style = Typography.bodyMedium.copy(color = ForestMuted),
                    modifier = Modifier.padding(vertical = 12.dp)
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    dailyTasks.forEach { task ->
                        val isDone = currentDay.done.containsKey(task.id)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(ForestPanel2)
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.width(60.dp)) {
                                Text(
                                    text = formatMinutes(task.start),
                                    style = Typography.bodySmall.copy(fontWeight = FontWeight.Bold, color = ForestAccent)
                                )
                                Text(
                                    text = formatMinutes(task.end),
                                    style = Typography.bodySmall.copy(fontSize = 10.sp, color = ForestMuted)
                                )
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = task.title,
                                    style = Typography.titleMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                )
                                Text(
                                    text = "${task.room} · Reminder ${formatMinutes(task.trigger)}",
                                    style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp)
                                )
                            }
                            CheckSquare(
                                isDone = isDone,
                                isAllowed = true,
                                onClick = {
                                    if (isDone) dataSource.undoTask(task)
                                    else dataSource.completeTask(task)
                                }
                            )
                        }
                    }
                }
            }
        }

        // Weekly Timetable Overview
        GlassPanel {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    EyebrowBadge(text = "SECTION D · NST + RUFP")
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Weekly timetable overview",
                        style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                    )
                }
                Text(
                    text = "${weeklyDays.size} days",
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                weeklyDays.forEach { day ->
                    WeeklyDayCard(day)
                }
            }
        }
    }
}

@Composable
private fun WeeklyDayCard(day: com.example.uthjabsdk.core.model.WeeklyTimetableDay) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(14.dp))
            .background(ForestPanel2)
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = day.label,
                style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (day.badge == "Today") ForestAccent else ForestPanel)
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = day.badge,
                    style = Typography.labelSmall.copy(
                        color = if (day.badge == "Today") ForestDarkText else ForestMuted,
                        fontSize = 9.sp
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        if (day.items.isEmpty()) {
            Text(
                text = "No NST snapshot or RUFP class for this day.",
                style = Typography.bodySmall.copy(color = ForestMuted)
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                day.items.forEach { item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(ForestPanel)
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = item.time,
                            style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp),
                            modifier = Modifier.width(96.dp)
                        )
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (item.source == "NST") ForestAccent.copy(alpha = 0.2f) else ForestPeach.copy(alpha = 0.2f))
                                .padding(horizontal = 4.dp, vertical = 1.dp)
                        ) {
                            Text(
                                text = item.source,
                                style = Typography.labelSmall.copy(
                                    fontSize = 8.sp,
                                    color = if (item.source == "NST") ForestAccent else ForestPeach
                                )
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = item.title,
                                style = Typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                            )
                            if (item.location.isNotBlank()) {
                                Text(
                                    text = item.location,
                                    style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 10.sp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Attendance Subtab
 */
@Composable
private fun AttendanceTabContent(
    summary: AcademicSummary,
    courses: List<CourseAttendance>
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Aggregated Metrics
        GlassPanel {
            EyebrowBadge(text = "ATTENDANCE OVERVIEW")
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = "Aggregated metrics",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                AttendanceSummaryCard(
                    title = "Combined",
                    percent = summary.combined.percent,
                    subtext = "${summary.combined.attended} / ${summary.combined.total} lectures",
                    modifier = Modifier.weight(1f)
                )
                AttendanceSummaryCard(
                    title = "NST Core",
                    percent = summary.nst.percent,
                    subtext = "${summary.nst.attended} / ${summary.nst.total} attended",
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                AttendanceSummaryCard(
                    title = "RUFP Foundation",
                    percent = summary.rufp.percent,
                    subtext = "${summary.rufp.attended} / ${summary.rufp.total} attended",
                    modifier = Modifier.weight(1f)
                )
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(14.dp))
                        .background(ForestPanel2)
                        .padding(12.dp)
                ) {
                    Column {
                        Text(
                            text = "Contest XP",
                            style = Typography.bodySmall.copy(color = ForestMuted)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "%,d XP".format(summary.contestXp),
                            style = Typography.headlineMedium.copy(fontWeight = FontWeight.Bold, color = ForestPeach)
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "Across tracked contests",
                            style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 10.sp)
                        )
                    }
                }
            }
        }

        // Subject Breakdown Cards
        GlassPanel {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    EyebrowBadge(text = "COURSE BREAKDOWN")
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Subject attendance cards",
                        style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                    )
                }
                Text(
                    text = "${courses.size} courses",
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                courses.forEach { course ->
                    CourseCard(course)
                }
            }
        }
    }
}

@Composable
private fun AttendanceSummaryCard(
    title: String,
    percent: Float,
    subtext: String,
    modifier: Modifier = Modifier
) {
    val barColor = if (percent >= 80f) StatusGood else if (percent >= 75f) ForestAccent else StatusDanger

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(ForestPanel2)
            .padding(12.dp)
    ) {
        Column {
            Text(text = title, style = Typography.bodySmall.copy(color = ForestMuted))
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "${"%.1f".format(percent)}%",
                style = Typography.headlineMedium.copy(fontWeight = FontWeight.Bold, color = barColor)
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = subtext,
                style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 10.sp)
            )
            Spacer(modifier = Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { (percent / 100f).coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = barColor,
                trackColor = ForestPanel
            )
        }
    }
}

@Composable
private fun CourseCard(course: CourseAttendance) {
    val toneColor = if (course.percent >= 80f) StatusGood else if (course.percent >= 75f) ForestAccent else StatusDanger

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(14.dp))
            .background(ForestPanel2)
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(ForestPanel)
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text(
                    text = course.group,
                    style = Typography.labelSmall.copy(fontSize = 10.sp, color = ForestAccent)
                )
            }

            Text(
                text = "${"%.1f".format(course.percent)}%",
                style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold, color = toneColor)
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = course.name,
            style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
        )
        Text(
            text = "${course.code} · ${course.attended} attended · ${course.total} total",
            style = Typography.bodySmall.copy(color = ForestMuted)
        )

        Spacer(modifier = Modifier.height(8.dp))

        LinearProgressIndicator(
            progress = { (course.percent / 100f).coerceIn(0f, 1f) },
            modifier = Modifier
                .fillMaxWidth()
                .height(5.dp)
                .clip(RoundedCornerShape(2.5.dp)),
            color = toneColor,
            trackColor = ForestPanel
        )

        Spacer(modifier = Modifier.height(6.dp))

        val adviceText = when {
            course.canMiss != null && course.canMiss > 0 -> "Can miss ${course.canMiss} safely"
            course.needAttend != null && course.needAttend > 0 -> "Attend ${course.needAttend} more to reach 75%"
            course.percent >= 75f -> "On track for 75%"
            else -> "Review attendance"
        }
        Text(
            text = adviceText,
            style = Typography.bodySmall.copy(
                fontSize = 11.sp,
                color = if (course.canMiss != null) ForestGreen else ForestPeach
            )
        )
    }
}

/**
 * Mail Subtab
 */
@Composable
private fun MailTabContent(
    emails: List<AcademicMailItem>
) {
    val urgentCount = emails.count { it.priority == "urgent" || it.priority == "high" }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        GlassPanel(backgroundColor = ForestPanel2) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    EyebrowBadge(text = "MAILBOX FEED")
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "${emails.size} messages · $urgentCount priority",
                        style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                }
                Text(
                    text = "Bounded local snapshot",
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )
            }
        }

        GlassPanel {
            Text(
                text = "Recent communications",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(12.dp))

            if (emails.isEmpty()) {
                Text(
                    text = "No approved academic notices in this update.",
                    style = Typography.bodyMedium.copy(color = ForestMuted),
                    modifier = Modifier.padding(vertical = 16.dp)
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    emails.forEach { item ->
                        MailCard(item)
                    }
                }
            }
        }
    }
}

@Composable
private fun MailCard(item: AcademicMailItem) {
    val isUrgent = item.priority == "urgent" || item.priority == "high"

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .border(BorderStroke(1.dp, if (isUrgent) ForestPeach else ForestLine), RoundedCornerShape(14.dp))
            .background(ForestPanel2)
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(ForestPanel)
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(text = item.category, style = Typography.labelSmall.copy(fontSize = 9.sp))
                }
                if (isUrgent) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(ForestPeach.copy(alpha = 0.2f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = item.priority?.uppercase() ?: "PRIORITY",
                            style = Typography.labelSmall.copy(fontSize = 9.sp, color = ForestPeach)
                        )
                    }
                }
            }
            Text(text = item.date, style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp))
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = item.subject,
            style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
        )
        Text(
            text = item.sender,
            style = Typography.bodySmall.copy(color = ForestAccent, fontSize = 11.sp)
        )

        if (item.snippet.isNotBlank()) {
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = item.snippet,
                style = Typography.bodyMedium.copy(color = ForestText, fontSize = 12.sp)
            )
        }

        if (!item.actionItem.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(ForestPanel)
                    .padding(8.dp)
            ) {
                Text(
                    text = "Next step · ${item.actionItem}",
                    style = Typography.bodySmall.copy(color = ForestGreen, fontWeight = FontWeight.SemiBold)
                )
            }
        }
    }
}

/**
 * Notes & Homework Subtab
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotesTabContent(
    notes: List<StudyNote>,
    onToggleNote: (String) -> Unit,
    onAddNote: (String, String) -> Unit
) {
    val subjects = listOf(
        "General",
        "Problem solving & programming",
        "Mathematics I",
        "Systems & AI",
        "Social Communication",
        "Self & Society",
        "Understanding India"
    )
    var selectedSubject by remember { mutableStateOf(subjects.first()) }
    var noteText by remember { mutableStateOf("") }
    var dropdownExpanded by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Study Queue
        GlassPanel {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    EyebrowBadge(text = "STUDY QUEUE")
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Notes & assignments",
                        style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                    )
                }
                Text(
                    text = "${notes.count { !it.done }} open",
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            if (notes.isEmpty()) {
                Text(
                    text = "A clear mind starts here. Add your next assignment or a quick class note below.",
                    style = Typography.bodyMedium.copy(color = ForestMuted),
                    modifier = Modifier.padding(vertical = 14.dp)
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    notes.forEach { note ->
                        NoteCard(note = note, onToggle = { onToggleNote(note.id) })
                    }
                }
            }
        }

        // Capture a Thought Form
        GlassPanel {
            EyebrowBadge(text = "CAPTURE")
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = "Capture a thought or assignment",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )

            Spacer(modifier = Modifier.height(14.dp))

            // Subject selector
            ExposedDropdownMenuBox(
                expanded = dropdownExpanded,
                onExpandedChange = { dropdownExpanded = it }
            ) {
                OutlinedTextField(
                    value = selectedSubject,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Subject") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = dropdownExpanded) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ForestAccent,
                        unfocusedBorderColor = ForestLine
                    ),
                    modifier = Modifier
                        .menuAnchor()
                        .fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = dropdownExpanded,
                    onDismissRequest = { dropdownExpanded = false }
                ) {
                    subjects.forEach { s ->
                        DropdownMenuItem(
                            text = { Text(s) },
                            onClick = {
                                selectedSubject = s
                                dropdownExpanded = false
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedTextField(
                value = noteText,
                onValueChange = { noteText = it },
                label = { Text("Homework or note") },
                placeholder = { Text("What do you need to work on?") },
                minLines = 3,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = ForestAccent,
                    unfocusedBorderColor = ForestLine
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(14.dp))

            Button(
                onClick = {
                    if (noteText.isNotBlank()) {
                        onAddNote(selectedSubject, noteText)
                        noteText = ""
                    }
                },
                enabled = noteText.isNotBlank(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ForestAccent,
                    contentColor = ForestDarkText,
                    disabledContainerColor = ForestPanel2,
                    disabledContentColor = ForestMuted
                ),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
            ) {
                Text(
                    "Save note ↗",
                    fontWeight = FontWeight.Bold,
                    color = if (noteText.isNotBlank()) ForestDarkText else ForestMuted
                )
            }
        }
    }
}

@Composable
private fun NoteCard(note: StudyNote, onToggle: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(14.dp))
            .background(ForestPanel2)
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "${note.subject} · ${note.date}",
                style = Typography.bodySmall.copy(color = ForestAccent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            )
            CheckSquare(
                isDone = note.done,
                isAllowed = true,
                onClick = onToggle,
                size = 30.dp
            )
        }

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = note.text,
            style = Typography.bodyMedium.copy(
                color = if (note.done) ForestMuted else ForestText
            )
        )
    }
}

private fun formatMinutes(minutes: Int): String {
    val m = ((minutes % 1440) + 1440) % 1440
    val h = m / 60
    val min = m % 60
    val amPm = if (h >= 12) "PM" else "AM"
    val hour12 = if (h % 12 == 0) 12 else h % 12
    return "%d:%02d %s".format(hour12, min, amPm)
}
