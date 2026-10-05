package com.example.uthjabsdk.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
import com.example.uthjabsdk.core.design.ForestBg
import com.example.uthjabsdk.core.design.ForestDarkText
import com.example.uthjabsdk.core.design.ForestGreen
import com.example.uthjabsdk.core.design.ForestLine
import com.example.uthjabsdk.core.design.ForestMuted
import com.example.uthjabsdk.core.design.ForestPanel
import com.example.uthjabsdk.core.design.ForestPanel2
import com.example.uthjabsdk.core.design.ForestText
import com.example.uthjabsdk.core.design.GlassPanel
import com.example.uthjabsdk.core.design.SegmentTabs
import com.example.uthjabsdk.core.design.StatusDanger
import com.example.uthjabsdk.core.design.StatusGood
import com.example.uthjabsdk.core.design.StatusWarning
import com.example.uthjabsdk.core.design.Typography
import com.example.uthjabsdk.core.design.UthJaIcons
import com.example.uthjabsdk.core.design.UthToast
import com.example.uthjabsdk.core.design.UthTopBar
import com.example.uthjabsdk.core.model.SyncOverallState
import com.example.uthjabsdk.core.ui.UthJaBsdkDataSource
import com.example.uthjabsdk.feature.academic.AcademicScreen
import com.example.uthjabsdk.feature.food.FoodScreen
import com.example.uthjabsdk.feature.hostel.HostelScreen
import com.example.uthjabsdk.feature.radar.RadarScreen
import com.example.uthjabsdk.feature.reports.ReportsScreen
import com.example.uthjabsdk.feature.routine.RoutineScreen
import com.example.uthjabsdk.feature.sync.SyncControlDialog
import com.example.uthjabsdk.feature.wakecalls.ui.WakeCallsScreen
import kotlinx.coroutines.delay
import java.time.LocalTime
import java.time.format.DateTimeFormatter

sealed class Screen(val route: String) {
    object Routine : Screen("routine")
    object Academic : Screen("academic")
    object MoreTools : Screen("more_tools")
    object Food : Screen("food")
    object Hostel : Screen("hostel")
    object Radar : Screen("radar")
    object Reports : Screen("reports")
    object WakeCalls : Screen("wake_calls")
}

@Composable
fun AppNavHost(
    dataSource: UthJaBsdkDataSource,
    modifier: Modifier = Modifier
) {
    var currentScreen by rememberSaveable { mutableStateOf<String>(Screen.Routine.route) }
    var academicSubTab by rememberSaveable { mutableStateOf("timetable") }
    var showSyncDialog by remember { mutableStateOf(false) }

    // Toast state
    var toastMessage by remember { mutableStateOf<String?>(null) }
    var toastUndo by remember { mutableStateOf<(() -> Unit)?>(null) }

    // Clock state
    var currentTimeString by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        val formatter = DateTimeFormatter.ofPattern("hh:mm a")
        while (true) {
            currentTimeString = LocalTime.now().format(formatter)
            delay(1000)
        }
    }

    val syncStatus by dataSource.syncState.collectAsState()
    val alarmsEnabled by dataSource.alarmsEnabled.collectAsState()

    val syncIndicatorColor = when (syncStatus.overallState) {
        SyncOverallState.RUNNING -> ForestAccent
        SyncOverallState.ERROR -> StatusDanger
        SyncOverallState.PARTIAL -> StatusWarning
        else -> StatusGood
    }

    // Android Back button handling
    BackHandler(enabled = currentScreen != Screen.Routine.route) {
        if (currentScreen in listOf(Screen.Food.route, Screen.Hostel.route, Screen.Radar.route, Screen.Reports.route, Screen.WakeCalls.route)) {
            currentScreen = Screen.MoreTools.route
        } else {
            currentScreen = Screen.Routine.route
        }
    }

    Scaffold(
        modifier = modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding(),
        containerColor = ForestBg,
        topBar = {
            UthTopBar(
                title = "Akshat Kumar",
                currentTimeText = currentTimeString,
                alarmsEnabled = alarmsEnabled,
                onAlarmsToggle = {
                    dataSource.toggleAlarms()
                    toastMessage = if (!alarmsEnabled) "Reminders enabled" else "Reminders paused"
                    toastUndo = null
                },
                onSyncClick = { showSyncDialog = true },
                syncIndicatorColor = syncIndicatorColor,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
            )
        },
        bottomBar = {
            UthBottomNavBar(
                currentRoute = currentScreen,
                onNavigate = { targetRoute ->
                    currentScreen = targetRoute
                }
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (currentScreen) {
                Screen.Routine.route -> {
                    RoutineScreen(
                        dataSource = dataSource,
                        onNavigateToNotes = {
                            academicSubTab = "notes"
                            currentScreen = Screen.Academic.route
                        },
                        onNavigateToFood = {
                            currentScreen = Screen.Food.route
                        },
                        onShowToast = { msg, undo ->
                            toastMessage = msg
                            toastUndo = undo
                        }
                    )
                }
                Screen.Academic.route -> {
                    AcademicScreen(
                        dataSource = dataSource,
                        initialTab = academicSubTab,
                        onShowToast = { msg, undo ->
                            toastMessage = msg
                            toastUndo = undo
                        }
                    )
                }
                Screen.MoreTools.route -> {
                    MoreToolsMenuScreen(
                        onSelectTool = { toolRoute ->
                            currentScreen = toolRoute
                        }
                    )
                }
                Screen.Food.route -> {
                    FoodScreen(
                        dataSource = dataSource,
                        onShowToast = { msg, undo ->
                            toastMessage = msg
                            toastUndo = undo
                        }
                    )
                }
                Screen.Hostel.route -> {
                    HostelScreen(
                        dataSource = dataSource,
                        onShowToast = { msg, undo ->
                            toastMessage = msg
                            toastUndo = undo
                        }
                    )
                }
                Screen.Radar.route -> {
                    RadarScreen(
                        dataSource = dataSource,
                        onShowToast = { msg, undo ->
                            toastMessage = msg
                            toastUndo = undo
                        }
                    )
                }
                Screen.Reports.route -> {
                    ReportsScreen(
                        dataSource = dataSource,
                        onShowToast = { msg, undo ->
                            toastMessage = msg
                            toastUndo = undo
                        }
                    )
                }
                Screen.WakeCalls.route -> {
                    WakeCallsScreen()
                }
            }

            // Toast overlay at the top/center
            UthToast(
                message = toastMessage,
                onUndo = toastUndo,
                onDismiss = {
                    toastMessage = null
                    toastUndo = null
                },
                modifier = Modifier.align(Alignment.BottomCenter)
            )
        }
    }

    if (showSyncDialog) {
        val realDs = dataSource as? com.example.uthjabsdk.core.ui.RealUthJaBsdkDataSource
        SyncControlDialog(
            syncStatus = syncStatus,
            onTriggerSync = {
                dataSource.triggerSync()
            },
            onDismiss = { showSyncDialog = false },
            pairingEndpoint = realDs?.getPairingEndpoint(),
            hasReadToken = realDs?.isReadTokenConfigured() ?: false,
            onSavePairing = if (realDs != null) {
                { endpoint, token -> realDs.updatePairing(endpoint, token) }
            } else null,
            onClearPairing = if (realDs != null) {
                { realDs.clearPairing() }
            } else null
        )
    }
}

@Composable
private fun UthBottomNavBar(
    currentRoute: String,
    onNavigate: (String) -> Unit
) {
    val isToolsActive = currentRoute in listOf(
        Screen.MoreTools.route,
        Screen.Food.route,
        Screen.Hostel.route,
        Screen.Radar.route,
        Screen.Reports.route,
        Screen.WakeCalls.route
    )

    NavigationBar(
        containerColor = ForestPanel2,
        contentColor = ForestText,
        modifier = Modifier
            .fillMaxWidth()
            .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp))
            .clip(RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp))
    ) {
        NavigationBarItem(
            selected = currentRoute == Screen.Routine.route,
            onClick = { onNavigate(Screen.Routine.route) },
            icon = {
                Icon(
                    imageVector = UthJaIcons.Routine,
                    contentDescription = "Routine",
                    modifier = Modifier.size(22.dp)
                )
            },
            label = { Text("Routine", fontSize = 11.sp) },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = ForestDarkText,
                selectedTextColor = ForestAccent,
                indicatorColor = ForestAccent,
                unselectedIconColor = ForestMuted,
                unselectedTextColor = ForestMuted
            )
        )

        NavigationBarItem(
            selected = currentRoute == Screen.Academic.route,
            onClick = { onNavigate(Screen.Academic.route) },
            icon = {
                Icon(
                    imageVector = UthJaIcons.Academic,
                    contentDescription = "Academic",
                    modifier = Modifier.size(22.dp)
                )
            },
            label = { Text("Academic", fontSize = 11.sp) },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = ForestDarkText,
                selectedTextColor = ForestAccent,
                indicatorColor = ForestAccent,
                unselectedIconColor = ForestMuted,
                unselectedTextColor = ForestMuted
            )
        )

        NavigationBarItem(
            selected = isToolsActive,
            onClick = { onNavigate(Screen.MoreTools.route) },
            icon = {
                Icon(
                    imageVector = UthJaIcons.Tools,
                    contentDescription = "More tools",
                    modifier = Modifier.size(22.dp)
                )
            },
            label = { Text("Tools", fontSize = 11.sp) },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = ForestDarkText,
                selectedTextColor = ForestAccent,
                indicatorColor = ForestAccent,
                unselectedIconColor = ForestMuted,
                unselectedTextColor = ForestMuted
            )
        )
    }
}

/**
 * More Tools Menu Screen listing:
 * - Food & Water
 * - Hostel Life
 * - Opportunity Radar
 * - Reports
 */
@Composable
private fun MoreToolsMenuScreen(
    onSelectTool: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        EyebrowBadge(text = "AKSHAT’S WORKSPACE")
        Text(
            text = "More campus tools",
            style = Typography.headlineLarge
        )
        Text(
            text = "Quick access to your campus nutrition, hostel logistics, hackathon radar, and daily history.",
            style = Typography.bodyMedium.copy(color = ForestMuted)
        )

        Spacer(modifier = Modifier.height(8.dp))

        ToolNavigationCard(
            title = "Food & Water",
            subtitle = "Water logging, meal entries and saved RU Print mess menu.",
            icon = UthJaIcons.Food,
            onClick = { onSelectTool(Screen.Food.route) }
        )

        ToolNavigationCard(
            title = "Hostel Life",
            subtitle = "Laundry drop & pickup timings, wardrobe tracker, swim prep and packing.",
            icon = UthJaIcons.Hostel,
            onClick = { onSelectTool(Screen.Hostel.route) }
        )

        ToolNavigationCard(
            title = "Opportunity Radar",
            subtitle = "Hackathons ranked for your skills, class schedule, and travel distance from Sonipat.",
            icon = UthJaIcons.Radar,
            onClick = { onSelectTool(Screen.Radar.route) }
        )

        ToolNavigationCard(
            title = "Priority wake calls",
            subtitle = "Let selected people wake you during your chosen morning window.",
            icon = UthJaIcons.Alarm,
            onClick = { onSelectTool(Screen.WakeCalls.route) }
        )

        ToolNavigationCard(
            title = "Reports & Backups",
            subtitle = "Daily activity records, contest averages, and manual data export.",
            icon = UthJaIcons.Reports,
            onClick = { onSelectTool(Screen.Reports.route) }
        )
    }
}

@Composable
private fun ToolNavigationCard(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit
) {
    GlassPanel(
        backgroundColor = ForestPanel2,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(ForestAccent.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = ForestAccent,
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = Typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )
            }

            Icon(
                imageVector = UthJaIcons.ChevronRight,
                contentDescription = null,
                tint = ForestMuted,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
