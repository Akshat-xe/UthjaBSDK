package com.example.uthjabsdk.feature.radar

import android.content.Intent
import android.net.Uri
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
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
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
import com.example.uthjabsdk.core.model.RadarOpportunity
import com.example.uthjabsdk.core.model.SyncSourceStateStatus
import com.example.uthjabsdk.core.ui.UthJaBsdkDataSource
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * RadarScreen: Opportunity Radar (#radar) view.
 * Displays published listings harvested on the laptop. Harvesting and Copilot remain laptop-only.
 */
@Composable
fun RadarScreen(
    dataSource: UthJaBsdkDataSource,
    onShowToast: (String, (() -> Unit)?) -> Unit = { _, _ -> }
) {
    val items by dataSource.radarItems.collectAsState()
    val syncStatus by dataSource.syncState.collectAsState()
    val context = LocalContext.current

    var selectedScope by remember { mutableStateOf("all") } // "nearby", "local", "remote", "all"
    var selectedDifficulty by remember { mutableStateOf("easy") } // "easy", "medium", "hard", "unverified"
    var selectedTier by remember { mutableStateOf("A") } // "S", "A", "B", "C", "D", "E"
    var onlyFavorites by remember { mutableStateOf(false) }

    var summaryItem by remember { mutableStateOf<RadarOpportunity?>(null) }

    val filteredItems = remember(items, selectedScope, selectedDifficulty, selectedTier, onlyFavorites) {
        items.filter { item ->
            val scopeMatch = selectedScope == "all" ||
                (selectedScope == "nearby" && item.areaScope in setOf("local", "remote")) ||
                item.areaScope == selectedScope
            val favMatch = !onlyFavorites || item.saved
            val diffMatch = if (selectedDifficulty == "unverified") item.difficulty == "unverified"
            else item.difficulty == selectedDifficulty && item.tier == selectedTier
            scopeMatch && favMatch && diffMatch
        }
    }

    val skills = listOf(
        "HTML", "CSS", "AI-assisted web building", "prompt-led prototyping",
        "automation", "JavaScript basics", "Python", "APIs", "practical ML"
    )

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
                text = "Build something worth showing.",
                style = Typography.headlineLarge
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Nearby hackathons ranked for your skills, class schedule, and travel distance.",
                style = Typography.bodyMedium.copy(color = ForestMuted)
            )
        }

        // Source Status Card
        GlassPanel(backgroundColor = ForestPanel2) {
            Text(
                text = "Your sources, clearly shown",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Public Unstop and Devpost listings are updated on your laptop, then brought to this phone when you sync.",
                style = Typography.bodySmall.copy(color = ForestMuted)
            )

            Spacer(modifier = Modifier.height(10.dp))

            val radarSource = syncStatus.sources["radar"]
            val sourceLabel = when (radarSource?.status) {
                SyncSourceStateStatus.SUCCESS -> "Updated"
                SyncSourceStateStatus.PARTIAL -> "Partly updated"
                SyncSourceStateStatus.FAILED -> "Failed"
                SyncSourceStateStatus.SETUP_REQUIRED -> "Setup needed"
                else -> "Waiting"
            }
            SourceChip(name = "Radar", status = sourceLabel, isCurrent = radarSource?.status == SyncSourceStateStatus.SUCCESS)

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = radarSource?.message ?: "No laptop Radar snapshot imported yet",
                style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp)
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Skills Match
            Column {
                Text(
                    text = "Matching against what you know",
                    style = Typography.titleMedium.copy(fontSize = 12.sp, fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    skills.take(4).forEach { skill ->
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(ForestPanel)
                                .padding(horizontal = 6.dp, vertical = 3.dp)
                        ) {
                            Text(text = skill, style = Typography.bodySmall.copy(fontSize = 10.sp, color = ForestAccent))
                        }
                    }
                }
            }
        }

        // Scope Switcher & Favorites button
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            SegmentTabs(
                tabs = listOf(
                    "all" to "All",
                    "nearby" to "Near me",
                    "local" to "In person",
                    "remote" to "Online"
                ),
                selectedKey = selectedScope,
                onTabSelect = { selectedScope = it },
                modifier = Modifier.weight(1f)
            )

            Spacer(modifier = Modifier.width(8.dp))

            Button(
                onClick = { onlyFavorites = !onlyFavorites },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (onlyFavorites) ForestAccent else ForestPanel2,
                    contentColor = if (onlyFavorites) ForestDarkText else ForestText
                ),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.defaultMinSize(minHeight = 48.dp)
            ) {
                Text(
                    text = if (onlyFavorites) "★ Saved" else "☆ Saved",
                    color = if (onlyFavorites) ForestDarkText else ForestText,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        // Difficulty Tabs
        SegmentTabs(
            tabs = listOf(
                "easy" to "Easy",
                "medium" to "Medium",
                "hard" to "Hard",
                "unverified" to "Unverified"
            ),
            selectedKey = selectedDifficulty,
            onTabSelect = { selectedDifficulty = it },
            modifier = Modifier.fillMaxWidth()
        )

        // Tier selector if not unverified
        if (selectedDifficulty != "unverified") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf("S", "A", "B", "C").forEach { tier ->
                    val isSelected = selectedTier == tier
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (isSelected) ForestAccent else ForestPanel2)
                            .border(BorderStroke(1.dp, if (isSelected) ForestAccent else ForestLine), RoundedCornerShape(10.dp))
                            .defaultMinSize(minHeight = 48.dp)
                            .clickable { selectedTier = tier }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "$tier tier",
                            style = Typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                color = if (isSelected) ForestDarkText else ForestText,
                                fontSize = 13.sp
                            )
                        )
                    }
                }
            }
        }

        // Opportunity Cards
        if (filteredItems.isEmpty()) {
            GlassPanel {
                Text(
                    text = if (onlyFavorites) "No saved events in this view yet. Tap ☆ on an event to save it."
                    else "No events meet this tier's evidence threshold right now. Nothing is added just to fill the list.",
                    style = Typography.bodyMedium.copy(color = ForestMuted),
                    modifier = Modifier.padding(vertical = 16.dp)
                )
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                filteredItems.forEach { opp ->
                    RadarCard(
                        opportunity = opp,
                        onToggleFavorite = {
                            dataSource.toggleRadarFavorite(opp.id)
                            onShowToast(if (opp.saved) "Removed from saved" else "Saved opportunity", null)
                        },
                        onOpenSummary = { summaryItem = opp },
                        onOpenUrl = {
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(opp.eventUrl))
                                context.startActivity(intent)
                            } catch (_: Exception) {
                                onShowToast("Official link: ${opp.eventUrl}", null)
                            }
                        }
                    )
                }
            }
        }
    }

    // Event Summary Modal Dialog
    summaryItem?.let { opp ->
        RadarSummaryDialog(
            opportunity = opp,
            onDismiss = { summaryItem = null },
            onUpdateProgress = { newProgress ->
                dataSource.setRadarProgress(opp.id, newProgress)
                summaryItem = opp.copy(progress = newProgress)
                onShowToast("Progress: $newProgress", null)
            }
        )
    }
}

private fun displayRadarDeadline(raw: String): String {
    val pattern = DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a")
    return runCatching {
        OffsetDateTime.parse(raw)
            .atZoneSameInstant(ZoneId.of("Asia/Kolkata"))
            .format(pattern)
    }.getOrElse {
        runCatching { LocalDate.parse(raw).format(DateTimeFormatter.ofPattern("d MMM yyyy")) }
            .getOrDefault(raw)
    }
}

@Composable
private fun SourceChip(name: String, status: String, isCurrent: Boolean) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(ForestPanel)
            .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(if (isCurrent) StatusGood else ForestMuted)
            )
            Text(
                text = "$name · $status ↗",
                style = Typography.bodySmall.copy(fontSize = 11.sp, color = ForestText)
            )
        }
    }
}

@Composable
private fun RadarCard(
    opportunity: RadarOpportunity,
    onToggleFavorite: () -> Unit,
    onOpenSummary: () -> Unit,
    onOpenUrl: () -> Unit
) {
    GlassPanel {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                EyebrowBadge(text = "${opportunity.platform} · ${opportunity.areaScope.uppercase()}")
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = opportunity.title,
                    style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                )
                Text(
                    text = opportunity.organizer,
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )
            }

            IconButton(onClick = onToggleFavorite) {
                Text(
                    text = if (opportunity.saved) "★" else "☆",
                    style = Typography.headlineMedium.copy(
                        color = if (opportunity.saved) ForestPeach else ForestMuted
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Facts list
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            FactItem(symbol = "⌖", text = opportunity.location)
            opportunity.registrationDeadline?.let {
                FactItem(symbol = "⌛", text = "Registration closes ${displayRadarDeadline(it)}")
            }
            opportunity.teamSize?.let {
                FactItem(symbol = "♧", text = "Team $it")
            }
            opportunity.prizePool?.let {
                FactItem(symbol = "✧", text = it)
            }
            if (opportunity.effortHours != null) {
                FactItem(symbol = "⚡", text = "Effort ~${opportunity.effortHours} h · ${opportunity.confidence} confidence")
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = onOpenSummary,
                colors = ButtonDefaults.buttonColors(
                    containerColor = ForestAccent,
                    contentColor = ForestDarkText
                ),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier
                    .weight(1f)
                    .defaultMinSize(minHeight = 48.dp)
            ) {
                Text("See summary", color = ForestDarkText, fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = onOpenUrl,
                colors = ButtonDefaults.buttonColors(
                    containerColor = ForestPanel2,
                    contentColor = ForestText
                ),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.defaultMinSize(minHeight = 48.dp)
            ) {
                Text("Official ↗", color = ForestText)
            }
        }
    }
}

@Composable
private fun FactItem(symbol: String, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(text = symbol, style = Typography.bodySmall.copy(color = ForestAccent, fontSize = 11.sp))
        Text(text = text, style = Typography.bodySmall.copy(color = ForestText, fontSize = 11.sp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RadarSummaryDialog(
    opportunity: RadarOpportunity,
    onDismiss: () -> Unit,
    onUpdateProgress: (String) -> Unit
) {
    val progressOptions = listOf("Not started", "Interested", "Registered", "Building", "Submitted", "Completed", "Not for me")
    var dropdownExpanded by remember { mutableStateOf(false) }

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
                    .padding(20.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    EyebrowBadge(text = "${opportunity.platform} · ${opportunity.tier} TIER · ${opportunity.difficulty.uppercase()}")
                    IconButton(onClick = onDismiss) {
                        Icon(imageVector = UthJaIcons.Close, contentDescription = "Close", tint = ForestMuted)
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = opportunity.title,
                    style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                )
                Text(
                    text = opportunity.organizer,
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )

                Spacer(modifier = Modifier.height(14.dp))

                Text(
                    text = "What you’ll build or do",
                    style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = opportunity.description,
                    style = Typography.bodyMedium.copy(color = ForestText)
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Progress selector
                Text(text = "Your progress", style = Typography.labelSmall)
                Spacer(modifier = Modifier.height(6.dp))
                ExposedDropdownMenuBox(
                    expanded = dropdownExpanded,
                    onExpandedChange = { dropdownExpanded = it }
                ) {
                    OutlinedTextField(
                        value = opportunity.progress,
                        onValueChange = {},
                        readOnly = true,
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
                        progressOptions.forEach { opt ->
                            DropdownMenuItem(
                                text = { Text(opt) },
                                onClick = {
                                    onUpdateProgress(opt)
                                    dropdownExpanded = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = onDismiss,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ForestPanel2,
                        contentColor = ForestText
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                ) {
                    Text("Close", color = ForestText)
                }
            }
        }
    }
}
