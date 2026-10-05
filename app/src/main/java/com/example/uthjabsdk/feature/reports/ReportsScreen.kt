package com.example.uthjabsdk.feature.reports

import android.content.Intent
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import com.example.uthjabsdk.core.design.Typography
import com.example.uthjabsdk.core.model.DailyEventLog
import com.example.uthjabsdk.core.ui.UthJaBsdkDataSource
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId

/**
 * ReportsScreen: Look back, without the noise (#reports).
 * History logs, daily check-in table, week overview, contest averages, and data export.
 */
@Composable
fun ReportsScreen(
    dataSource: UthJaBsdkDataSource,
    onShowToast: (String, (() -> Unit)?) -> Unit = { _, _ -> }
) {
    val currentDate by dataSource.currentDate.collectAsState()
    val currentDay by dataSource.currentDay.collectAsState()
    val allDays by dataSource.allDays.collectAsState()
    val eventLogs by dataSource.eventLogs.collectAsState()
    val dayEventLogs = remember(eventLogs, currentDate) {
        eventLogs.filter { log ->
            runCatching {
                Instant.parse(log.timestamp).atZone(ZoneId.of("Asia/Kolkata")).toLocalDate().toString() == currentDate
            }.getOrDefault(false)
        }
    }
    val tasksRevision by dataSource.tasksRevision.collectAsState()
    val tasks = remember(currentDate, tasksRevision) { dataSource.getTasksForDate(currentDate) }

    val completedTasks = tasks.count { currentDay.done.containsKey(it.id) }
    val context = LocalContext.current

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
                text = "Look back, without the noise.",
                style = Typography.headlineLarge
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "An honest record of what you checked in. No invented scores.",
                style = Typography.bodyMedium.copy(color = ForestMuted)
            )
        }

        // Subject Summary Cards
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            ReportStatCard(
                label = "Completed steps",
                value = "$completedTasks/${tasks.size}",
                color = ForestAccent,
                modifier = Modifier.weight(1f)
            )
            ReportStatCard(
                label = "Water logged",
                value = "${"%.2f".format(currentDay.waterMl / 1000f)} L",
                color = ForestGreen,
                modifier = Modifier.weight(1f)
            )
            ReportStatCard(
                label = "Check-ins",
                value = "${dayEventLogs.size}",
                color = ForestPeach,
                modifier = Modifier.weight(1f)
            )
        }

        // Daily Record Table
        GlassPanel {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Your daily record",
                    style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            val exportJson = dataSource.exportPhoneActions()
                            if (exportJson == null) {
                                onShowToast("No phone data available to export", null)
                                return@Button
                            }
                            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                type = "application/json"
                                putExtra(Intent.EXTRA_SUBJECT, "Uth ja BSDK phone data")
                                putExtra(Intent.EXTRA_TEXT, exportJson)
                            }
                            context.startActivity(Intent.createChooser(shareIntent, "Export phone data"))
                            onShowToast("Phone data ready to share", null)
                        },
                        modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ForestAccent,
                            contentColor = ForestDarkText
                        ),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text("Export data ↓", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ForestDarkText)
                    }

                    Button(
                        onClick = {
                            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, "Daily report · $currentDate")
                                putExtra(Intent.EXTRA_TEXT, "Daily report for $currentDate: $completedTasks of ${tasks.size} steps completed.")
                            }
                            context.startActivity(Intent.createChooser(shareIntent, "Share report"))
                            onShowToast("Report prepared", null)
                        },
                        modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ForestPanel2,
                            contentColor = ForestText
                        ),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text("Share report ↓", fontSize = 11.sp, color = ForestText)
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            if (dayEventLogs.isEmpty()) {
                Text(
                    text = "Nothing recorded for this day yet.",
                    style = Typography.bodyMedium.copy(color = ForestMuted),
                    modifier = Modifier.padding(vertical = 12.dp)
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    dayEventLogs.take(15).forEach { log ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(ForestPanel2)
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = log.effectiveTime,
                                style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp),
                                modifier = Modifier.width(80.dp)
                            )
                            Text(
                                text = log.title ?: log.taskId ?: "Daily check-in",
                                style = Typography.bodyMedium.copy(color = ForestText, fontSize = 12.sp),
                                modifier = Modifier.weight(1f)
                            )
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(ForestPanel)
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = reportEventLabel(log.type),
                                    style = Typography.labelSmall.copy(color = ForestAccent, fontSize = 9.sp)
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Reports use your recorded actions. Export data shares your phone actions as JSON; choose where to save it. Parent delivery is not connected.",
                style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 10.sp)
            )
        }

        // This week, one day at a time
        GlassPanel {
            Text(
                text = "This week, one day at a time",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(10.dp))

            val currentLocalDate = try { LocalDate.parse(currentDate) } catch (_: Exception) { LocalDate.now() }
            val weekDates = (-6..0).map { currentLocalDate.plusDays(it.toLong()) }

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                weekDates.forEach { d ->
                    val dStr = d.toString()
                    val dayRec = allDays[dStr]
                    val dayTasks = dataSource.getTasksForDate(dStr)
                    val completed = dayRec?.done?.size ?: 0

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(ForestPanel2)
                            .clickable { dataSource.setDate(dStr) }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = dStr,
                            style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        )
                        Text(
                            text = "$completed / ${dayTasks.size} completed →",
                            style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 12.sp)
                        )
                    }
                }
            }
        }

        // Contest Progress Section
        GlassPanel {
            EyebrowBadge(text = "CONTEST PROGRESS")
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = "Self-reported scores",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(10.dp))

            val scores = allDays.values.flatMap { it.scores.values }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(ForestPanel2)
                    .padding(12.dp)
            ) {
                Column {
                    Text(text = "Recorded contests", style = Typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = if (scores.isNotEmpty()) "${"%.1f".format(scores.average())}% average · ${scores.size} scores"
                        else "No scores recorded yet.",
                        style = Typography.bodySmall.copy(color = ForestMuted)
                    )
                }
            }
        }
    }
}

private fun reportEventLabel(type: String): String = when (type) {
    "snapshot_imported" -> "Synced"
    "laundry_drop" -> "Laundry"
    "laundry_collected" -> "Collected"
    "water_added" -> "Water"
    "done" -> "Done"
    "undo" -> "Undone"
    "present" -> "Present"
    "absent" -> "Absent"
    "excused" -> "Excused"
    else -> type.replace('_', ' ').replaceFirstChar { it.uppercaseChar() }
}

@Composable
private fun ReportStatCard(
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(ForestPanel2)
            .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(14.dp))
            .padding(12.dp)
    ) {
        Column {
            Text(text = label, style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp))
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold, color = color)
            )
        }
    }
}
