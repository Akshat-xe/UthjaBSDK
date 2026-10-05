package com.example.uthjabsdk.core.design

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import kotlinx.coroutines.delay
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate

/**
 * Standard Dark Forest Glass Card / Panel matching --panel and --radius: 22px
 */
@Composable
fun GlassPanel(
    modifier: Modifier = Modifier,
    backgroundColor: Color = GlassPanelBg,
    borderColor: Color = GlassPanelBorder,
    shape: RoundedCornerShape = RoundedCornerShape(22.dp),
    content: @Composable () -> Unit
) {
    Surface(
        modifier = modifier
            .clip(shape)
            .border(BorderStroke(1.dp, borderColor), shape),
        color = backgroundColor,
        shape = shape
    ) {
        Column(
            modifier = Modifier.padding(18.dp)
        ) {
            content()
        }
    }
}

/**
 * Eyebrow / Tag label with uppercase letter-spacing
 */
@Composable
fun EyebrowBadge(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = ForestAccent
) {
    Text(
        text = text.uppercase(),
        style = Typography.labelSmall.copy(color = color),
        modifier = modifier
    )
}

/**
 * 7-Day Week Selector Strip matching the website weekStrip()
 */
@Composable
fun DaySelectorStrip(
    selectedDate: String, // YYYY-MM-DD
    todayDate: String,
    onDateSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val selectedLocalDate = try {
        LocalDate.parse(selectedDate)
    } catch (_: Exception) {
        LocalDate.now()
    }
    // Calculate Monday of the current week
    val dayOfWeek = selectedLocalDate.dayOfWeek.value // 1 (Mon) - 7 (Sun)
    val monday = selectedLocalDate.minusDays((dayOfWeek - 1).toLong())

    val days = (0..6).map { monday.plusDays(it.toLong()) }
    val dayNames = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        days.forEachIndexed { index, date ->
            val dateStr = date.toString()
            val isSelected = dateStr == selectedDate
            val isToday = dateStr == todayDate

            val bg = if (isSelected) ForestAccent else ForestPanel
            val textCol = if (isSelected) ForestDarkText else ForestText
            val borderCol = if (isSelected) ForestAccent else ForestLine

            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 2.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .border(BorderStroke(1.dp, borderCol), RoundedCornerShape(16.dp))
                    .background(bg)
                    .defaultMinSize(minHeight = 48.dp)
                    .clickable { onDateSelect(dateStr) }
                    .padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = dayNames[index],
                    style = Typography.bodySmall.copy(
                        color = if (isSelected) ForestDarkText else ForestMuted,
                        fontSize = 11.sp
                    )
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = date.dayOfMonth.toString(),
                    style = Typography.titleMedium.copy(
                        color = textCol,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                )
                if (isToday) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Box(
                        modifier = Modifier
                            .size(5.dp)
                            .clip(CircleShape)
                            .background(if (isSelected) ForestDarkText else ForestAccent)
                    )
                }
            }
        }
    }
}

/**
 * Circular progress ring matching website .progress-layout .ring
 */
@Composable
fun CircularProgressRing(
    progress: Float, // 0f to 1f
    modifier: Modifier = Modifier,
    size: Dp = 84.dp,
    strokeWidth: Dp = 8.dp,
    ringColor: Color = ForestAccent,
    trackColor: Color = ForestLine
) {
    Box(
        modifier = modifier.size(size),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            // Track
            drawArc(
                color = trackColor,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                style = Stroke(width = strokeWidth.toPx(), cap = StrokeCap.Round)
            )
            // Progress
            drawArc(
                color = ringColor,
                startAngle = -90f,
                sweepAngle = (progress.coerceIn(0f, 1f)) * 360f,
                useCenter = false,
                style = Stroke(width = strokeWidth.toPx(), cap = StrokeCap.Round)
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            val pct = (progress.coerceIn(0f, 1f) * 100).toInt()
            Text(
                text = "$pct%",
                style = Typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = ForestText
                )
            )
            Text(
                text = "OF DAY",
                style = Typography.labelSmall.copy(
                    fontSize = 7.sp,
                    color = ForestMuted,
                    letterSpacing = 0.5.sp
                )
            )
        }
    }
}

/**
 * Pill-style segment switcher matching .segments
 */
@Composable
fun SegmentTabs(
    tabs: List<Pair<String, String>>, // key, label
    selectedKey: String,
    onTabSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(ForestPanel2)
            .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(12.dp))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        tabs.forEach { (key, label) ->
            val isSelected = key == selectedKey
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (isSelected) ForestAccent else Color.Transparent)
                    .defaultMinSize(minHeight = 48.dp)
                    .clickable { onTabSelect(key) }
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = label,
                    style = Typography.bodyMedium.copy(
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (isSelected) ForestDarkText else ForestText
                    )
                )
            }
        }
    }
}

/**
 * Interactive check square matching .check-button
 */
@Composable
fun CheckSquare(
    isDone: Boolean,
    isAllowed: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 38.dp
) {
    Box(
        modifier = modifier
            .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
            .clickable(enabled = isAllowed || isDone) { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(size)
                .clip(RoundedCornerShape(10.dp))
                .border(
                    BorderStroke(
                        1.dp,
                        if (isDone) ForestAccent else if (isAllowed) ForestLine else ForestLine.copy(alpha = 0.4f)
                    ),
                    RoundedCornerShape(10.dp)
                )
                .background(if (isDone) ForestAccent else ForestPanel2),
            contentAlignment = Alignment.Center
        ) {
            if (isDone) {
                Icon(
                    imageVector = UthJaIcons.Check,
                    contentDescription = "Completed",
                    tint = ForestDarkText,
                    modifier = Modifier.size(20.dp)
                )
            } else if (!isAllowed) {
                Text(
                    text = "·",
                    style = Typography.titleMedium.copy(color = ForestMuted, fontSize = 20.sp)
                )
            }
        }
    }
}

/**
 * Top App Bar matching website header
 */
@Composable
fun UthTopBar(
    title: String = "Akshat Kumar",
    currentTimeText: String,
    alarmsEnabled: Boolean,
    onAlarmsToggle: () -> Unit,
    onSyncClick: () -> Unit,
    syncIndicatorColor: Color = StatusGood,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(18.dp)),
        color = ForestPanel,
        shape = RoundedCornerShape(18.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = title,
                style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold, color = ForestText),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Sync button
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(ForestPanel2)
                        .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(10.dp))
                        .defaultMinSize(minHeight = 48.dp)
                        .clickable { onSyncClick() }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(syncIndicatorColor)
                    )
                    Text(
                        text = "Sync",
                        style = Typography.bodySmall.copy(fontWeight = FontWeight.SemiBold, color = ForestText)
                    )
                }

                // Reminders button
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (alarmsEnabled) ForestAccent.copy(alpha = 0.15f) else ForestPanel2)
                        .border(BorderStroke(1.dp, if (alarmsEnabled) ForestAccent else ForestLine), RoundedCornerShape(10.dp))
                        .defaultMinSize(minHeight = 48.dp)
                        .clickable { onAlarmsToggle() }
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = UthJaIcons.Alarm,
                        contentDescription = "Reminders",
                        tint = if (alarmsEnabled) ForestAccent else ForestMuted,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = if (alarmsEnabled) "Active" else "Off",
                        style = Typography.bodySmall.copy(
                            fontSize = 11.sp,
                            color = if (alarmsEnabled) ForestAccent else ForestMuted
                        )
                    )
                }

                // Live Clock
                Text(
                    text = currentTimeText,
                    style = Typography.bodyMedium.copy(fontWeight = FontWeight.Medium, color = ForestText)
                )
            }
        }
    }
}

/**
 * Toast Notification banner with optional Undo action
 */
@Composable
fun UthToast(
    message: String?,
    onUndo: (() -> Unit)? = null,
    onDismiss: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    LaunchedEffect(message) {
        if (!message.isNullOrBlank()) {
            kotlinx.coroutines.delay(3500)
            onDismiss()
        }
    }

    AnimatedVisibility(
        visible = !message.isNullOrBlank(),
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier
    ) {
        if (!message.isNullOrBlank()) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .border(BorderStroke(1.dp, ForestAccent), RoundedCornerShape(14.dp)),
                color = ForestPanel,
                shape = RoundedCornerShape(14.dp),
                shadowElevation = 6.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = message,
                        style = Typography.bodyMedium.copy(color = ForestText),
                        modifier = Modifier.weight(1f)
                    )
                    if (onUndo != null) {
                        Spacer(modifier = Modifier.width(10.dp))
                        Box(
                            modifier = Modifier
                                .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                                .clickable {
                                    onUndo()
                                    onDismiss()
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "Undo",
                                style = Typography.titleMedium.copy(
                                    color = ForestAccent,
                                    fontWeight = FontWeight.Bold
                                ),
                                modifier = Modifier.padding(4.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
