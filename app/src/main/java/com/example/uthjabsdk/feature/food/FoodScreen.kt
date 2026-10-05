package com.example.uthjabsdk.feature.food

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import com.example.uthjabsdk.core.design.Typography
import com.example.uthjabsdk.core.design.UthJaIcons
import com.example.uthjabsdk.core.model.FoodEntry
import com.example.uthjabsdk.core.ui.UthJaBsdkDataSource
import java.time.LocalDate

/**
 * FoodScreen: Native implementation of Uth ja BSDK Food & Water (#food).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodScreen(
    dataSource: UthJaBsdkDataSource,
    onShowToast: (String, (() -> Unit)?) -> Unit = { _, _ -> }
) {
    val currentDate by dataSource.currentDate.collectAsState()
    val currentDay by dataSource.currentDay.collectAsState()
    val allMenus by dataSource.mealMenu.collectAsState()
    val todayStr = remember { LocalDate.now().toString() }

    val date = try { LocalDate.parse(currentDate) } catch (_: Exception) { LocalDate.now() }
    val dayName = date.dayOfWeek.name.lowercase().replaceFirstChar { it.uppercase() }
    val dayMenu = allMenus[dayName] ?: emptyMap()

    // Form state
    val mealTypes = listOf("Breakfast", "Lunch", "Snacks", "Dinner", "Other")
    var selectedMeal by remember { mutableStateOf(mealTypes.first()) }
    var foodItemText by remember { mutableStateOf("") }
    var foodAmountText by remember { mutableStateOf("") }
    var mealDropdownExpanded by remember { mutableStateOf(false) }

    var customWaterText by remember { mutableStateOf("") }

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
                text = "Make room for a good meal.",
                style = Typography.headlineLarge
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "A saved menu for quick access, even on a slow connection.",
                style = Typography.bodyMedium.copy(color = ForestMuted)
            )
        }

        // Week strip
        DaySelectorStrip(
            selectedDate = currentDate,
            todayDate = todayStr,
            onDateSelect = { dataSource.setDate(it) }
        )

        // Water Tracking Panel
        GlassPanel {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Water",
                    style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                )
                Text(
                    text = "Daily log",
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "${"%.2f".format(currentDay.waterMl / 1000f)} litres",
                style = Typography.headlineMedium.copy(color = ForestAccent, fontWeight = FontWeight.Bold)
            )
            Text(
                text = "${currentDay.waterMl} ml logged",
                style = Typography.bodySmall.copy(color = ForestMuted)
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

            Spacer(modifier = Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        val prev = currentDay.waterMl
                        dataSource.addWater(250)
                        onShowToast("250 ml logged.", { dataSource.undoWater(prev) })
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ForestPanel2,
                        contentColor = ForestText
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minHeight = 48.dp)
                ) {
                    Text("+ 250 ml", color = ForestText)
                }
                Button(
                    onClick = {
                        val prev = currentDay.waterMl
                        dataSource.addWater(500)
                        onShowToast("500 ml logged.", { dataSource.undoWater(prev) })
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ForestPanel2,
                        contentColor = ForestText
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minHeight = 48.dp)
                ) {
                    Text("+ 500 ml", color = ForestText)
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = customWaterText,
                    onValueChange = { customWaterText = it },
                    label = { Text("Other amount (ml)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ForestAccent,
                        unfocusedBorderColor = ForestLine
                    ),
                    modifier = Modifier.weight(1f)
                )
                val isValidAmount = (customWaterText.toIntOrNull() ?: 0) > 0
                Button(
                    onClick = {
                        val ml = customWaterText.toIntOrNull() ?: 0
                        if (ml > 0) {
                            val prev = currentDay.waterMl
                            dataSource.addWater(ml)
                            customWaterText = ""
                            onShowToast("$ml ml water logged.", { dataSource.undoWater(prev) })
                        }
                    },
                    enabled = isValidAmount,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ForestAccent,
                        contentColor = ForestDarkText,
                        disabledContainerColor = ForestPanel2,
                        disabledContentColor = ForestMuted
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                ) {
                    Text(
                        "Log",
                        fontWeight = FontWeight.Bold,
                        color = if (isValidAmount) ForestDarkText else ForestMuted
                    )
                }
            }
        }

        // Log Food or Drink Form
        GlassPanel {
            Text(
                text = "Log food or drink",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )

            Spacer(modifier = Modifier.height(14.dp))

            ExposedDropdownMenuBox(
                expanded = mealDropdownExpanded,
                onExpandedChange = { mealDropdownExpanded = it }
            ) {
                OutlinedTextField(
                    value = selectedMeal,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Meal") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = mealDropdownExpanded) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ForestAccent,
                        unfocusedBorderColor = ForestLine
                    ),
                    modifier = Modifier
                        .menuAnchor()
                        .fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = mealDropdownExpanded,
                    onDismissRequest = { mealDropdownExpanded = false }
                ) {
                    mealTypes.forEach { m ->
                        DropdownMenuItem(
                            text = { Text(m) },
                            onClick = {
                                selectedMeal = m
                                mealDropdownExpanded = false
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = foodItemText,
                    onValueChange = { foodItemText = it },
                    label = { Text("Food or drink") },
                    placeholder = { Text("What did you have?") },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ForestAccent,
                        unfocusedBorderColor = ForestLine
                    ),
                    modifier = Modifier.weight(1f)
                )

                val plannedDishes = dayMenu[selectedMeal.lowercase()] ?: emptyList()
                Button(
                    onClick = {
                        if (plannedDishes.isNotEmpty()) {
                            foodItemText = plannedDishes.joinToString(", ")
                            foodAmountText = "Planned menu"
                            onShowToast("$selectedMeal menu filled in.", null)
                        }
                    },
                    enabled = plannedDishes.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ForestPanel2,
                        contentColor = ForestAccent,
                        disabledContainerColor = ForestPanel2,
                        disabledContentColor = ForestMuted
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                ) {
                    Text(
                        "Use menu",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (plannedDishes.isNotEmpty()) ForestAccent else ForestMuted
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedTextField(
                value = foodAmountText,
                onValueChange = { foodAmountText = it },
                label = { Text("Amount or note (optional)") },
                placeholder = { Text("1 bowl, 250 ml…") },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = ForestAccent,
                    unfocusedBorderColor = ForestLine
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(14.dp))

            Button(
                onClick = {
                    if (foodItemText.isNotBlank()) {
                        dataSource.addFoodEntry(selectedMeal, foodItemText, foodAmountText.ifBlank { null })
                        foodItemText = ""
                        foodAmountText = ""
                        onShowToast("Added to food log.", null)
                    }
                },
                enabled = foodItemText.isNotBlank(),
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
                    "Add to food log",
                    fontWeight = FontWeight.Bold,
                    color = if (foodItemText.isNotBlank()) ForestDarkText else ForestMuted
                )
            }
        }

        // Today's Food Entries Log
        GlassPanel {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Today's food & drink",
                    style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                )
                Text(
                    text = "${currentDay.foodEntries.size} entries",
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (currentDay.foodEntries.isEmpty()) {
                Text(
                    text = "Nothing logged yet. Add a meal, snack, drink, or water above.",
                    style = Typography.bodyMedium.copy(color = ForestMuted),
                    modifier = Modifier.padding(vertical = 12.dp)
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    currentDay.foodEntries.asReversed().forEach { entry ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(ForestPanel2)
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = entry.item,
                                    style = Typography.titleMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                )
                                Text(
                                    text = "${entry.meal}${if (!entry.amount.isNullOrBlank()) " · ${entry.amount}" else ""}",
                                    style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp)
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                                    .clickable {
                                        dataSource.removeFoodEntry(entry.id)
                                        onShowToast("Removed entry", null)
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Remove",
                                    style = Typography.bodySmall.copy(color = ForestPeach, fontWeight = FontWeight.SemiBold),
                                    modifier = Modifier.padding(4.dp)
                                )
                            }
                        }
                    }
                }
            }
        }

        // Saved Campus Menu
        GlassPanel {
            Text(
                text = "Saved campus menu ($dayName)",
                style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = Modifier.height(12.dp))

            val mealInfo = listOf(
                Triple("breakfast", "MEAL 01 · BREAKFAST", "8:00 AM opening · routine at 8:25 AM"),
                Triple("lunch", "MEAL 02 · LUNCH", "1:00–2:00 PM · lunch window"),
                Triple("snacks", "MEAL 03 · SNACKS", "5:00–6:00 PM · quiet hour"),
                Triple("dinner", "MEAL 04 · DINNER", "8:00–9:30 PM · dinner window")
            )

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                mealInfo.forEach { (key, title, timing) ->
                    val dishes = dayMenu[key] ?: emptyList()
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(12.dp))
                            .background(ForestPanel2)
                            .padding(12.dp)
                    ) {
                        EyebrowBadge(text = title)
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = key.replaceFirstChar { it.uppercase() },
                            style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                        )
                        Text(
                            text = timing,
                            style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp)
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = dishes.ifEmpty { listOf("No saved dishes for this day.") }.joinToString(" · "),
                            style = Typography.bodyMedium.copy(color = ForestText, fontSize = 12.sp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Campus menu synced with RU Print.",
                style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp)
            )
        }
    }
}
