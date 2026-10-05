package com.example.uthjabsdk.feature.routine

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.uthjabsdk.core.design.CheckSquare
import com.example.uthjabsdk.core.design.CircularProgressRing
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
import com.example.uthjabsdk.core.design.StatusGood
import com.example.uthjabsdk.core.design.Typography
import com.example.uthjabsdk.core.design.UthJaIcons
import com.example.uthjabsdk.core.model.DayRecord
import com.example.uthjabsdk.core.model.RoutineTask
import com.example.uthjabsdk.core.ui.FakeUiDataSource
import com.example.uthjabsdk.core.ui.UthJaBsdkDataSource
import java.time.LocalDate
import java.time.LocalTime

/**
 * RoutineScreen: Native implementation of Uth ja BSDK Routine (#today).
 */
@Composable
fun RoutineScreen(
    dataSource: UthJaBsdkDataSource,
    onNavigateToNotes: () -> Unit = {},
    onNavigateToFood: () -> Unit = {},
    onShowToast: (String, (() -> Unit)?) -> Unit = { _, _ -> }
) {
    val currentDate by dataSource.currentDate.collectAsState()
    val currentDay by dataSource.currentDay.collectAsState()
    val tasksRevision by dataSource.tasksRevision.collectAsState()
    val tasks = remember(currentDate, tasksRevision) { dataSource.getTasksForDate(currentDate) }

    val todayStr = remember { LocalDate.now().toString() }
    val nowTime = remember { LocalTime.now() }
    val currentMinute = nowTime.hour * 60 + nowTime.minute

    var filter by remember { mutableStateOf("all") } // "upcoming", "all", "done"
    var expandedTaskId by remember { mutableStateOf<String?>(null) }
    var editingTask by remember { mutableStateOf<RoutineTask?>(null) }
    var showAddTaskDialog by remember { mutableStateOf(false) }
    var showWakeCheckInDialog by remember { mutableStateOf<RoutineTask?>(null) }
    var showRestDialog by remember { mutableStateOf(false) }

    val completedCount = tasks.count { currentDay.done.containsKey(it.id) }
    val progress = if (tasks.isNotEmpty()) completedCount.toFloat() / tasks.size else 0f
    val classesCount = tasks.count { it.kind == "class" || it.kind == "contest" }

    // Primary / Focus Task calculation
    val focusTask = remember(tasks, currentDay, currentDate) {
        val isToday = currentDate == todayStr
        if (!isToday) {
            tasks.firstOrNull { !currentDay.done.containsKey(it.id) } ?: tasks.firstOrNull()
        } else {
            tasks.firstOrNull { it.start <= currentMinute && it.end > currentMinute && (it.kind == "class" || it.kind == "contest") }
                ?: tasks.firstOrNull { it.start <= currentMinute && it.end > currentMinute && !currentDay.done.containsKey(it.id) }
                ?: tasks.firstOrNull { it.start > currentMinute && !currentDay.done.containsKey(it.id) }
                ?: tasks.lastOrNull { !currentDay.done.containsKey(it.id) }
                ?: tasks.firstOrNull()
        }
    }

    val displayedTasks = remember(tasks, currentDay, filter, currentDate) {
        when (filter) {
            "done" -> tasks.filter { currentDay.done.containsKey(it.id) }
            "upcoming" -> tasks.filter {
                !currentDay.done.containsKey(it.id) && (currentDate != todayStr || it.end > currentMinute)
            }
            else -> tasks
        }
    }

    val greeting = remember(currentMinute) {
        when {
            currentMinute < 720 -> "Good morning"
            currentMinute < 1020 -> "Good afternoon"
            else -> "Good evening"
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Page Heading
        Column {
            EyebrowBadge(
                text = if (currentDate == todayStr) "AKSHAT’S ROUTINE" else "AKSHAT’S WORKSPACE"
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = if (currentDate == todayStr) "$greeting, Akshat." else "A day, thoughtfully planned.",
                style = Typography.headlineLarge
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Your day, in order. Just focus on the next small step.",
                style = Typography.bodyMedium.copy(color = ForestMuted)
            )
        }

        // Date control header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(14.dp))
                .background(ForestPanel)
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable {
                        val prev = LocalDate.parse(currentDate).minusDays(1).toString()
                        dataSource.setDate(prev)
                    }
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = UthJaIcons.ChevronLeft,
                    contentDescription = "Previous Day",
                    tint = ForestText
                )
            }

            Text(
                text = currentDate,
                style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold, color = ForestText)
            )

            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable {
                        val next = LocalDate.parse(currentDate).plusDays(1).toString()
                        dataSource.setDate(next)
                    }
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = UthJaIcons.ChevronRight,
                    contentDescription = "Next Day",
                    tint = ForestText
                )
            }
        }

        // Week strip
        DaySelectorStrip(
            selectedDate = currentDate,
            todayDate = todayStr,
            onDateSelect = { dataSource.setDate(it) }
        )

        // Focus Card
        focusTask?.let { task ->
            FocusCard(
                task = task,
                currentDate = currentDate,
                todayStr = todayStr,
                currentMinute = currentMinute,
                isDone = currentDay.done.containsKey(task.id),
                isAllowed = dataSource.canCompleteTask(task, currentDate, nowTime),
                onAction = {
                    when (task.kind) {
                        "wake" -> showWakeCheckInDialog = task
                        "packing" -> expandedTaskId = "packing"
                        "choice" -> expandedTaskId = task.id
                        "sleep" -> {
                            dataSource.completeTask(task)
                            showRestDialog = true
                            onShowToast("Day completed. Sleep well.", null)
                        }
                        else -> {
                            dataSource.completeTask(task)
                            onShowToast("Completed ${task.title}", { dataSource.undoTask(task) })
                        }
                    }
                }
            )
        }

        // A little progress panel
        GlassPanel {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "A little progress",
                    style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                )
                Text(
                    text = "↗",
                    style = Typography.titleMedium.copy(color = ForestAccent)
                )
            }
            Spacer(modifier = Modifier.height(14.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                CircularProgressRing(progress = progress)
                Column {
                    Text(
                        text = if (completedCount > 0) "$completedCount steps completed" else "A fresh page.",
                        style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = if (completedCount > 0) "Small actions add up. Keep going at your pace."
                        else "Your first check-in starts the momentum.",
                        style = Typography.bodySmall.copy(color = ForestMuted)
                    )
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(ForestPanel2)
                        .padding(12.dp)
                ) {
                    Column {
                        Text(
                            text = "$completedCount / ${tasks.size}",
                            style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold, color = ForestAccent)
                        )
                        Text(
                            text = "Tasks completed",
                            style = Typography.bodySmall.copy(color = ForestMuted)
                        )
                    }
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(ForestPanel2)
                        .padding(12.dp)
                ) {
                    Column {
                        Text(
                            text = "$classesCount",
                            style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold, color = ForestGreen)
                        )
                        Text(
                            text = "Classes scheduled",
                            style = Typography.bodySmall.copy(color = ForestMuted)
                        )
                    }
                }
            }
        }

        // Quick Water Logging Panel
        GlassPanel {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Water, a small reset.",
                    style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                )
                Icon(
                    imageVector = UthJaIcons.WaterDrop,
                    contentDescription = null,
                    tint = ForestAccent,
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "${"%.2f".format(currentDay.waterMl / 1000f)} litres logged today",
                style = Typography.headlineMedium.copy(color = ForestAccent, fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(10.dp))
            // 8 water segment bars
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                for (i in 0 until 8) {
                    val isFilled = currentDay.waterMl / 250 > i
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(if (isFilled) ForestAccent else ForestPanel2)
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = {
                    val prev = currentDay.waterMl
                    dataSource.addWater(250)
                    onShowToast("250 ml logged.", { dataSource.undoWater(prev) })
                },
                enabled = currentDate <= todayStr,
                colors = ButtonDefaults.buttonColors(
                    containerColor = ForestPanel2,
                    contentColor = ForestText,
                    disabledContainerColor = ForestPanel2,
                    disabledContentColor = ForestMuted
                ),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
            ) {
                Text(
                    text = "+  I drank 250 ml",
                    color = if (currentDate <= todayStr) ForestText else ForestMuted
                )
            }
        }

        // Timeline Section (Daily Flow)
        GlassPanel {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Your daily flow (${tasks.size} steps)",
                    style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                            .clickable { showAddTaskDialog = true },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "+ Add",
                            style = Typography.bodyMedium.copy(
                                color = ForestAccent,
                                fontWeight = FontWeight.Bold
                            ),
                            modifier = Modifier.padding(4.dp)
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                            .clickable {
                                dataSource.setDate(todayStr)
                                filter = "all"
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Today ↗",
                            style = Typography.bodyMedium.copy(color = ForestMuted),
                            modifier = Modifier.padding(4.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Filter segments
            SegmentTabs(
                tabs = listOf(
                    "upcoming" to "Upcoming",
                    "all" to "Full day",
                    "done" to "Done"
                ),
                selectedKey = filter,
                onTabSelect = { filter = it },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Vertical Timeline list
            if (displayedTasks.isEmpty()) {
                Text(
                    text = "All clear here. Your full day is one tap away.",
                    style = Typography.bodyMedium.copy(color = ForestMuted),
                    modifier = Modifier.padding(vertical = 24.dp)
                )
            } else {
                Column(modifier = Modifier.fillMaxWidth()) {
                    displayedTasks.forEachIndexed { index, task ->
                        val isDone = currentDay.done.containsKey(task.id)
                        val isAllowed = dataSource.canCompleteTask(task, currentDate, nowTime)
                        val isLive = currentDate == todayStr && currentMinute >= task.start && currentMinute < task.end
                        val isExpanded = expandedTaskId == task.id

                        TimelineTaskRow(
                            task = task,
                            isDone = isDone,
                            isAllowed = isAllowed,
                            isLive = isLive,
                            isExpanded = isExpanded,
                            dayRecord = currentDay,
                            onToggleExpand = {
                                expandedTaskId = if (isExpanded) null else task.id
                            },
                            onToggleDone = {
                                if (isDone) {
                                    dataSource.undoTask(task)
                                    onShowToast("Reopened ${task.title}", null)
                                } else {
                                    if (task.kind == "wake") {
                                        showWakeCheckInDialog = task
                                    } else {
                                        dataSource.completeTask(task)
                                        onShowToast("Completed ${task.title}", { dataSource.undoTask(task) })
                                    }
                                }
                            },
                            onPackingCheck = { idx -> dataSource.togglePackingCheck(idx) },
                            onEveningChoice = { mode ->
                                dataSource.setEveningMode(mode)
                                dataSource.completeTask(task, "done", "evening_$mode")
                                onShowToast("Saved $mode evening", null)
                            },
                            onSaveScore = { score ->
                                dataSource.saveContestScore(task.id, score)
                                onShowToast("Saved score $score%", null)
                            },
                            onMarkAttendance = { status ->
                                dataSource.completeTask(task, status)
                                onShowToast("Marked $status", null)
                            },
                            onEdit = {
                                editingTask = task
                            }
                        )

                        if (index < displayedTasks.size - 1) {
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                    }
                }
            }
        }
    }

    // Wake Check-in Dialog
    showWakeCheckInDialog?.let { task ->
        WakeCheckInDialog(
            task = task,
            onDismiss = { showWakeCheckInDialog = null },
            onFinish = {
                dataSource.completeTask(task, "done", "camera_capture_acknowledged")
                showWakeCheckInDialog = null
                showRestDialog = true
                onShowToast("Wake check-in saved.", null)
            }
        )
    }

    // Rest Mode Dialog
    if (showRestDialog) {
        Dialog(onDismissRequest = { showRestDialog = false }) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .border(BorderStroke(1.dp, ForestAccent), RoundedCornerShape(22.dp)),
                color = ForestPanel,
                shape = RoundedCornerShape(22.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    EyebrowBadge(text = "REST MODE · THIS APP ONLY")
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "A quiet start to your day.",
                        style = Typography.headlineMedium.copy(fontWeight = FontWeight.Bold)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Drink hot water. Plug your phone in, freshen up and get ready for your morning.",
                        style = Typography.bodyMedium.copy(color = ForestMuted, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                    Button(
                        onClick = { showRestDialog = false },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ForestPanel2,
                            contentColor = ForestText
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp)
                    ) {
                        Text("Return to dashboard", color = ForestText)
                    }
                }
            }
        }
    }

    // Add Custom Task Dialog
    if (showAddTaskDialog || editingTask != null) {
        val editing = editingTask
        TaskFormDialog(
            existingTask = editing,
            onDismiss = {
                showAddTaskDialog = false
                editingTask = null
            },
            onSave = { newTask ->
                dataSource.saveCustomTask(newTask)
                showAddTaskDialog = false
                editingTask = null
                onShowToast("Saved routine ${newTask.title}", null)
            }
        )
    }
}

/**
 * FocusCard composable matching website focus card
 */
@Composable
private fun FocusCard(
    task: RoutineTask,
    currentDate: String,
    todayStr: String,
    currentMinute: Int,
    isDone: Boolean,
    isAllowed: Boolean,
    onAction: () -> Unit
) {
    val isLive = currentDate == todayStr && currentMinute >= task.start && currentMinute < task.end
    val minutesLeft = if (isLive) task.end - currentMinute else task.start - currentMinute

    GlassPanel(
        backgroundColor = ForestPanel2,
        borderColor = if (isLive) ForestAccent else ForestLine
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (isLive) StatusGood else ForestMuted)
                )
                EyebrowBadge(
                    text = if (isLive) "RIGHT NOW" else if (currentDate == todayStr) "UP NEXT" else "DAY PREVIEW",
                    color = if (isLive) ForestAccent else ForestMuted
                )
            }

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(ForestPanel)
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Text(
                    text = if (isLive) "${minutesLeft}m left"
                    else if (currentDate == todayStr && minutesLeft > 0) "In ${minutesLeft}m"
                    else formatMinutes(task.start),
                    style = Typography.bodySmall.copy(color = ForestText, fontWeight = FontWeight.SemiBold)
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Text(
            text = task.title,
            style = Typography.headlineMedium.copy(fontWeight = FontWeight.Bold)
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = task.detail,
            style = Typography.bodyMedium.copy(color = ForestMuted)
        )

        Spacer(modifier = Modifier.height(14.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                if (!task.room.isNullOrBlank()) {
                    Text(
                        text = task.room,
                        style = Typography.bodySmall.copy(fontWeight = FontWeight.SemiBold, color = ForestAccent)
                    )
                }
                Text(
                    text = "${formatMinutes(task.start)} – ${formatMinutes(task.end)}",
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )
            }

            Button(
                onClick = onAction,
                enabled = isAllowed || isDone,
                modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ForestAccent,
                    contentColor = ForestDarkText,
                    disabledContainerColor = ForestPanel,
                    disabledContentColor = ForestMuted
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = if (isDone) "Completed ✓"
                    else when (task.kind) {
                        "wake" -> "Wake check-in ↗"
                        "packing" -> "Open checklist ↗"
                        "class" -> "✓ Mark present ↗"
                        "choice" -> "Choose evening ↗"
                        else -> "✓ Mark done ↗"
                    },
                    fontWeight = FontWeight.Bold,
                    color = if (isAllowed || isDone) ForestDarkText else ForestMuted
                )
            }
        }
    }
}

/**
 * Single task row in the vertical timeline
 */
@Composable
private fun TimelineTaskRow(
    task: RoutineTask,
    isDone: Boolean,
    isAllowed: Boolean,
    isLive: Boolean,
    isExpanded: Boolean,
    dayRecord: DayRecord,
    onToggleExpand: () -> Unit,
    onToggleDone: () -> Unit,
    onPackingCheck: (Int) -> Unit,
    onEveningChoice: (String) -> Unit,
    onSaveScore: (Float) -> Unit,
    onMarkAttendance: (String) -> Unit,
    onEdit: () -> Unit
) {
    val borderColor = if (isLive) ForestAccent else if (isDone) ForestLine.copy(alpha = 0.5f) else ForestLine
    val bgColor = if (isLive) ForestPanel2.copy(alpha = 0.9f) else ForestPanel

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(BorderStroke(1.dp, borderColor), RoundedCornerShape(16.dp))
            .background(bgColor)
            .padding(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Time Column
            Column(
                modifier = Modifier.width(64.dp),
                horizontalAlignment = Alignment.Start
            ) {
                Text(
                    text = formatMinutes(task.start),
                    style = Typography.bodySmall.copy(
                        fontWeight = FontWeight.Bold,
                        color = if (isLive) ForestAccent else ForestText
                    )
                )
                Text(
                    text = formatMinutes(task.end),
                    style = Typography.bodySmall.copy(fontSize = 10.sp, color = ForestMuted)
                )
            }

            // Glyph Box
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (isLive) ForestAccent else ForestPanel2),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = glyphForTask(task),
                    contentDescription = null,
                    tint = if (isLive) ForestDarkText else ForestText,
                    modifier = Modifier.size(18.dp)
                )
            }

            Spacer(modifier = Modifier.width(10.dp))

            // Title & Status (clickable to expand)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onToggleExpand() }
                    .padding(vertical = 4.dp)
            ) {
                Text(
                    text = task.title,
                    style = Typography.titleMedium.copy(
                        fontWeight = FontWeight.SemiBold,
                        color = if (isDone) ForestMuted else ForestText
                    )
                )
                val statusText = when {
                    isDone -> "Completed"
                    isLive -> "Happening now"
                    !task.room.isNullOrBlank() -> "${task.room} · Reminder ${formatMinutes(task.trigger)}"
                    task.kind == "quiet" -> "Reminders paused"
                    task.kind == "packing" -> "${dayRecord.checks.size}/12 essentials packed"
                    else -> "Daily rhythm"
                }
                Text(
                    text = statusText,
                    style = Typography.bodySmall.copy(
                        color = if (isLive) ForestAccent else ForestMuted,
                        fontSize = 11.sp
                    )
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Checkbox
            CheckSquare(
                isDone = isDone,
                isAllowed = isAllowed,
                onClick = onToggleDone
            )
        }

        // Expanded detail section
        AnimatedVisibility(visible = isExpanded) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(ForestPanel2)
                    .padding(12.dp)
            ) {
                Text(
                    text = task.detail,
                    style = Typography.bodyMedium.copy(color = ForestText)
                )

                if (!task.room.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "${task.room} · ${formatMinutes(task.start)}–${formatMinutes(task.end)} · Reminder ${formatMinutes(task.trigger)}",
                        style = Typography.bodySmall.copy(color = ForestMuted)
                    )
                }

                // If packing item: interactive checklist
                if (task.kind == "packing") {
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = "Bag essentials (${dayRecord.checks.size}/12 checked)",
                        style = Typography.labelSmall
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    FakeUiDataSource.PACKING_ITEMS.forEachIndexed { i, item ->
                        val checked = dayRecord.checks.contains(i)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onPackingCheck(i) }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = checked,
                                onCheckedChange = { onPackingCheck(i) },
                                colors = CheckboxDefaults.colors(
                                    checkedColor = ForestAccent,
                                    checkmarkColor = ForestDarkText,
                                    uncheckedColor = ForestLine
                                )
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = item,
                                style = Typography.bodyMedium.copy(color = if (checked) ForestMuted else ForestText)
                            )
                        }
                    }
                }

                // If evening choice
                if (task.kind == "choice") {
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { onEveningChoice("guided") },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = ForestAccent,
                                contentColor = ForestDarkText
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(1f)
                                .defaultMinSize(minHeight = 48.dp)
                        ) {
                            Text("Guided evening", color = ForestDarkText, fontWeight = FontWeight.Bold)
                        }
                        Button(
                            onClick = { onEveningChoice("custom") },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = ForestPanel,
                                contentColor = ForestText
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(1f)
                                .defaultMinSize(minHeight = 48.dp)
                        ) {
                            Text("Custom until 11 PM", color = ForestText)
                        }
                    }
                }

                // If contest
                if (task.kind == "contest") {
                    Spacer(modifier = Modifier.height(10.dp))
                    var scoreText by remember { mutableStateOf("") }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = scoreText,
                            onValueChange = { scoreText = it },
                            label = { Text("Self-reported %") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = ForestAccent,
                                unfocusedBorderColor = ForestLine
                            ),
                            modifier = Modifier.weight(1f)
                        )
                        Button(
                            onClick = {
                                val s = scoreText.toFloatOrNull() ?: 0f
                                onSaveScore(s)
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = ForestAccent,
                                contentColor = ForestDarkText
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.defaultMinSize(minHeight = 48.dp)
                        ) {
                            Text("Save score", color = ForestDarkText, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // If class attendance actions
                if (task.kind in listOf("class", "contest")) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { onMarkAttendance("present") },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = ForestGreen,
                                contentColor = ForestDarkText
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(1f)
                                .defaultMinSize(minHeight = 48.dp)
                        ) {
                            Text("Present", color = ForestDarkText, fontWeight = FontWeight.Bold)
                        }
                        Button(
                            onClick = { onMarkAttendance("absent") },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = ForestPanel,
                                contentColor = ForestPeach
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(1f)
                                .defaultMinSize(minHeight = 48.dp)
                        ) {
                            Text("Absent", color = ForestPeach, fontWeight = FontWeight.Bold)
                        }
                        Button(
                            onClick = { onMarkAttendance("excused") },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = ForestPanel,
                                contentColor = ForestMuted
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(1f)
                                .defaultMinSize(minHeight = 48.dp)
                        ) {
                            Text("Excused", color = ForestMuted, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                            .clickable { onEdit() },
                        contentAlignment = Alignment.CenterStart
                    ) {
                        Text(
                            text = "Edit timing & instructions",
                            style = Typography.bodySmall.copy(
                                color = ForestAccent,
                                fontWeight = FontWeight.SemiBold
                            ),
                            modifier = Modifier.padding(4.dp)
                        )
                    }
                    Box(
                        modifier = Modifier
                            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                            .clickable { onToggleExpand() },
                        contentAlignment = Alignment.CenterEnd
                    ) {
                        Text(
                            text = "Close",
                            style = Typography.bodySmall.copy(color = ForestMuted),
                            modifier = Modifier.padding(4.dp)
                        )
                    }
                }
            }
        }
    }
}

/**
 * Wake check-in requires a real camera capture and user acknowledgement.
 */
@Composable
private fun WakeCheckInDialog(
    task: RoutineTask,
    onDismiss: () -> Unit,
    onFinish: () -> Unit
) {
    var acknowledged by remember { mutableStateOf(false) }
    var selfieBitmap by remember { mutableStateOf<Bitmap?>(null) }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) {
        bitmap -> selfieBitmap = bitmap
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .border(BorderStroke(1.dp, ForestAccent), RoundedCornerShape(22.dp)),
            color = ForestPanel,
            shape = RoundedCornerShape(22.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                EyebrowBadge(text = "WAKE CHECK-IN")
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Good morning, Akshat.",
                    style = Typography.headlineMedium.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Drink hot water, capture a live selfie to prove wake-up, and begin your day.",
                    style = Typography.bodyMedium.copy(color = ForestMuted)
                )

                Spacer(modifier = Modifier.height(14.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(ForestPanel2)
                        .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(14.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    if (selfieBitmap != null) {
                        Image(
                            bitmap = selfieBitmap!!.asImageBitmap(),
                            contentDescription = "Captured selfie preview",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                        )
                    } else {
                        Button(
                            onClick = { cameraLauncher.launch(null) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = ForestAccent,
                                contentColor = ForestDarkText
                            ),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.defaultMinSize(minHeight = 48.dp)
                        ) {
                            Text("Open camera for selfie", color = ForestDarkText, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .clickable { acknowledged = !acknowledged },
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = acknowledged,
                        onCheckedChange = { acknowledged = it },
                        colors = CheckboxDefaults.colors(
                            checkedColor = ForestAccent,
                            checkmarkColor = ForestDarkText
                        )
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "I am up and ready to start.",
                        style = Typography.bodyMedium.copy(color = ForestText)
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = onFinish,
                    enabled = acknowledged && selfieBitmap != null,
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
                        "Finish wake check-in",
                        fontWeight = FontWeight.Bold,
                        color = if (acknowledged && selfieBitmap != null) ForestDarkText else ForestMuted
                    )
                }
            }
        }
    }
}

/**
 * Task Form dialog for adding or editing routines
 */
@Composable
private fun TaskFormDialog(
    existingTask: RoutineTask?,
    onDismiss: () -> Unit,
    onSave: (RoutineTask) -> Unit
) {
    var title by remember { mutableStateOf(existingTask?.title ?: "") }
    var detail by remember { mutableStateOf(existingTask?.detail ?: "") }
    var startText by remember { mutableStateOf(existingTask?.let { formatTimeInput(it.start) } ?: "08:00") }
    var endText by remember { mutableStateOf(existingTask?.let { formatTimeInput(it.end) } ?: "08:30") }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(22.dp)),
            color = ForestPanel,
            shape = RoundedCornerShape(22.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                EyebrowBadge(text = "YOUR ROUTINE")
                Text(
                    text = if (existingTask != null) "Edit this routine" else "Add a personal routine",
                    style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                )

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Activity") },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ForestAccent,
                        unfocusedBorderColor = ForestLine
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = detail,
                    onValueChange = { detail = it },
                    label = { Text("What should you remember?") },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ForestAccent,
                        unfocusedBorderColor = ForestLine
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = startText,
                        onValueChange = { startText = it },
                        label = { Text("Starts (HH:MM)") },
                        modifier = Modifier.weight(1f),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ForestAccent,
                            unfocusedBorderColor = ForestLine
                        )
                    )
                    OutlinedTextField(
                        value = endText,
                        onValueChange = { endText = it },
                        label = { Text("Ends (HH:MM)") },
                        modifier = Modifier.weight(1f),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ForestAccent,
                            unfocusedBorderColor = ForestLine
                        )
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Button(
                        onClick = {
                            val startMin = parseTimeToMinutes(startText)
                            val endMin = parseTimeToMinutes(endText)
                            val task = RoutineTask(
                                id = existingTask?.id ?: java.util.UUID.randomUUID().toString(),
                                title = title,
                                detail = detail,
                                start = startMin,
                                end = endMin,
                                trigger = startMin,
                                kind = existingTask?.kind ?: "routine"
                            )
                            onSave(task)
                        },
                        enabled = title.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ForestAccent,
                            contentColor = ForestDarkText,
                            disabledContainerColor = ForestPanel2,
                            disabledContentColor = ForestMuted
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .weight(1f)
                            .defaultMinSize(minHeight = 48.dp)
                    ) {
                        Text(
                            "Save routine",
                            fontWeight = FontWeight.Bold,
                            color = if (title.isNotBlank()) ForestDarkText else ForestMuted
                        )
                    }

                    Button(
                        onClick = onDismiss,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ForestPanel2,
                            contentColor = ForestText
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp)
                    ) {
                        Text("Close", color = ForestText)
                    }
                }
            }
        }
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

private fun formatTimeInput(minutes: Int): String {
    val h = minutes / 60
    val m = minutes % 60
    return "%02d:%02d".format(h, m)
}

private fun parseTimeToMinutes(text: String): Int {
    val parts = text.split(":")
    if (parts.size == 2) {
        val h = parts[0].toIntOrNull() ?: 8
        val m = parts[1].toIntOrNull() ?: 0
        return h * 60 + m
    }
    return 480
}

private fun glyphForTask(task: RoutineTask): ImageVector {
    return when (task.kind) {
        "wake" -> UthJaIcons.Sun
        "freshen" -> UthJaIcons.Sun
        "study" -> UthJaIcons.Notes
        "packing" -> UthJaIcons.Backpack
        "meal" -> UthJaIcons.Food
        "class" -> UthJaIcons.Academic
        "contest" -> UthJaIcons.Radar
        "quiet" -> UthJaIcons.Moon
        "swim" -> UthJaIcons.WaterDrop
        "sleep" -> UthJaIcons.Moon
        "laundry" -> UthJaIcons.Hostel
        else -> UthJaIcons.Routine
    }
}
