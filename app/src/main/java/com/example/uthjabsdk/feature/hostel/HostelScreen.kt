package com.example.uthjabsdk.feature.hostel

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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import com.example.uthjabsdk.core.design.UthJaIcons
import com.example.uthjabsdk.core.model.LaundryRecord
import com.example.uthjabsdk.core.model.WardrobeItem
import com.example.uthjabsdk.core.ui.FakeUiDataSource
import com.example.uthjabsdk.core.ui.UthJaBsdkDataSource
import java.time.LocalDate

/**
 * HostelScreen: Native implementation of Uth ja BSDK Hostel Life (#life):
 * - Laundry loop (Drop-off, 3-day pickup timing calculation, collection status)
 * - Wardrobe inventory (Clean, Wearing, Laundry tracking)
 * - Swimming rhythm (Mon/Wed/Fri 7:30–8:15 PM checklist)
 * - Bag packing checklist (12 essentials)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HostelScreen(
    dataSource: UthJaBsdkDataSource,
    onShowToast: (String, (() -> Unit)?) -> Unit = { _, _ -> }
) {
    val currentDay by dataSource.currentDay.collectAsState()
    val allDays by dataSource.allDays.collectAsState()
    val wardrobe by dataSource.wardrobe.collectAsState()

    var clothingNameText by remember { mutableStateOf("") }

    // Find all laundry records across days
    val allLaundry = allDays.values.mapNotNull { it.laundry }.sortedByDescending { it.dropDate }

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
                text = "A place for the little things.",
                style = Typography.headlineLarge
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Laundry, clothes and a bag that is ready when you are.",
                style = Typography.bodyMedium.copy(color = ForestMuted)
            )
        }

        // The Laundry Loop
        GlassPanel {
            Text(
                text = "The laundry loop",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Drop off on an open day · pickup exactly 3 days later. I’ll find a free counter time around that day’s classes.",
                style = Typography.bodySmall.copy(color = ForestMuted)
            )

            Spacer(modifier = Modifier.height(14.dp))

            Button(
                onClick = {
                    dataSource.logLaundryDrop()
                    onShowToast("Laundry drop-off recorded.", null)
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = ForestPanel2,
                    contentColor = ForestText
                ),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.defaultMinSize(minHeight = 48.dp)
            ) {
                Text("Log a drop-off", color = ForestText)
            }

            Spacer(modifier = Modifier.height(14.dp))

            if (allLaundry.isEmpty()) {
                Text(
                    text = "No active laundry records logged yet.",
                    style = Typography.bodyMedium.copy(color = ForestMuted),
                    modifier = Modifier.padding(vertical = 10.dp)
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    allLaundry.forEach { laundry ->
                        LaundryCard(
                            laundry = laundry,
                            onCollect = {
                                dataSource.collectLaundry(laundry.dropDate)
                                onShowToast("Marked laundry collected", null)
                            }
                        )
                    }
                }
            }
        }

        // Your Wardrobe
        GlassPanel {
            Text(
                text = "Your wardrobe",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Add your real clothes. Track clean, wearing and laundry states.",
                style = Typography.bodySmall.copy(color = ForestMuted)
            )

            Spacer(modifier = Modifier.height(14.dp))

            // Add clothing row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = clothingNameText,
                    onValueChange = { clothingNameText = it },
                    label = { Text("Item name") },
                    placeholder = { Text("Olive T-shirt") },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ForestAccent,
                        unfocusedBorderColor = ForestLine
                    ),
                    modifier = Modifier.weight(1f)
                )

                Button(
                    onClick = {
                        if (clothingNameText.isNotBlank()) {
                            dataSource.addWardrobeItem(clothingNameText, null)
                            clothingNameText = ""
                            onShowToast("Added clothing item", null)
                        }
                    },
                    enabled = clothingNameText.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ForestPanel2,
                        contentColor = ForestText,
                        disabledContainerColor = ForestPanel2,
                        disabledContentColor = ForestMuted
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                ) {
                    Text(
                        "Add",
                        color = if (clothingNameText.isNotBlank()) ForestText else ForestMuted
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                wardrobe.forEach { item ->
                    WardrobeRow(
                        item = item,
                        onStatusChange = { newStatus ->
                            dataSource.setWardrobeStatus(item.id, newStatus)
                            onShowToast("${item.name}: $newStatus", null)
                        }
                    )
                }
            }
        }

        // Swimming Rhythm
        GlassPanel {
            Text(
                text = "Swimming rhythm",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Monday, Wednesday and Friday · 7:30–8:15 PM. Sunday is closed.",
                style = Typography.bodySmall.copy(color = ForestMuted)
            )

            Spacer(modifier = Modifier.height(12.dp))

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                FakeUiDataSource.SWIM_ITEMS.forEachIndexed { i, item ->
                    val checked = currentDay.swimChecks.contains(i)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp)
                            .clickable { dataSource.toggleSwimCheck(i) }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = checked,
                            onCheckedChange = { dataSource.toggleSwimCheck(i) },
                            colors = CheckboxDefaults.colors(
                                checkedColor = ForestAccent,
                                checkmarkColor = ForestDarkText,
                                uncheckedColor = ForestLine
                            )
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = item,
                            style = Typography.bodyMedium.copy(
                                color = if (checked) ForestMuted else ForestText
                            )
                        )
                    }
                }
            }
        }

        // Packing, without the backtracking
        GlassPanel {
            Text(
                text = "Packing, without the backtracking",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "${currentDay.checks.size} of 12 essentials checked. Saves after every tap.",
                style = Typography.bodySmall.copy(color = ForestMuted)
            )

            Spacer(modifier = Modifier.height(12.dp))

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                FakeUiDataSource.PACKING_ITEMS.forEachIndexed { i, item ->
                    val checked = currentDay.checks.contains(i)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp)
                            .clickable { dataSource.togglePackingCheck(i) }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = checked,
                            onCheckedChange = { dataSource.togglePackingCheck(i) },
                            colors = CheckboxDefaults.colors(
                                checkedColor = ForestAccent,
                                checkmarkColor = ForestDarkText,
                                uncheckedColor = ForestLine
                            )
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = item,
                            style = Typography.bodyMedium.copy(
                                color = if (checked) ForestMuted else ForestText
                            )
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LaundryCard(
    laundry: LaundryRecord,
    onCollect: () -> Unit
) {
    val isCollected = laundry.collectedAt != null
    val isOverdue = !isCollected && runCatching {
        LocalDate.parse(laundry.dueDate).isBefore(LocalDate.now())
    }.getOrDefault(false)

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
                text = "Laundry dropped off · ${laundry.dropDate}",
                style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (isCollected) ForestAccent.copy(alpha = 0.2f) else ForestPeach.copy(alpha = 0.2f))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = when {
                        isCollected -> "Collected"
                        isOverdue -> "Overdue"
                        else -> "Waiting"
                    },
                    style = Typography.labelSmall.copy(
                        fontSize = 9.sp,
                        color = if (isCollected) ForestAccent else ForestPeach
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = "${if (isOverdue) "Pickup was due" else "Pickup"} ${laundry.dueDate} · Counter open 8:30–10:00 AM and 4:00–6:00 PM",
            style = Typography.bodySmall.copy(color = ForestMuted)
        )

        if (!isCollected) {
            Spacer(modifier = Modifier.height(10.dp))
            Button(
                onClick = onCollect,
                colors = ButtonDefaults.buttonColors(
                    containerColor = ForestPanel,
                    contentColor = ForestAccent
                ),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.defaultMinSize(minHeight = 48.dp)
            ) {
                Text("Mark laundry collected", color = ForestAccent, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WardrobeRow(
    item: WardrobeItem,
    onStatusChange: (String) -> Unit
) {
    val statuses = listOf("Clean", "Wearing", "Laundry")
    var expanded by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(ForestPanel2)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "♧",
                style = Typography.headlineSmall.copy(color = ForestAccent)
            )
            Text(
                text = item.name,
                style = Typography.titleMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            )
        }

        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it }
        ) {
            Box(
                modifier = Modifier
                    .menuAnchor()
                    .clip(RoundedCornerShape(8.dp))
                    .background(ForestPanel)
                    .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(8.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Text(
                    text = "${item.status} ▾",
                    style = Typography.bodySmall.copy(
                        color = when (item.status) {
                            "Clean" -> ForestGreen
                            "Wearing" -> ForestAccent
                            else -> ForestPeach
                        },
                        fontWeight = FontWeight.SemiBold
                    )
                )
            }
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                statuses.forEach { s ->
                    DropdownMenuItem(
                        text = { Text(s) },
                        onClick = {
                            onStatusChange(s)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}
