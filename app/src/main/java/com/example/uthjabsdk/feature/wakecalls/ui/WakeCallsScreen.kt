package com.example.uthjabsdk.feature.wakecalls.ui

import android.Manifest
import android.app.NotificationManager
import android.app.TimePickerDialog
import android.app.role.RoleManager
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.ContactsContract
import android.provider.Settings
import android.telephony.PhoneNumberUtils
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.example.uthjabsdk.core.design.EyebrowBadge
import com.example.uthjabsdk.core.design.ForestAccent
import com.example.uthjabsdk.core.design.ForestDarkText
import com.example.uthjabsdk.core.design.ForestMuted
import com.example.uthjabsdk.core.design.ForestPanel2
import com.example.uthjabsdk.core.design.ForestText
import com.example.uthjabsdk.core.design.GlassPanel
import com.example.uthjabsdk.core.design.StatusGood
import com.example.uthjabsdk.core.design.StatusWarning
import com.example.uthjabsdk.core.design.Typography
import com.example.uthjabsdk.feature.wakecalls.core.WakeCallSettings
import com.example.uthjabsdk.feature.wakecalls.core.WakeCallSettingsStore
import com.example.uthjabsdk.feature.wakecalls.core.WakeCallReadiness
import com.example.uthjabsdk.feature.wakecalls.core.WakeCallStatus
import java.util.Locale
import kotlin.math.roundToInt

/** Android-only controls. Numbers and settings stay in the phone's private storage. */
@Composable
fun WakeCallsScreen() {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val store = remember(context) { WakeCallSettingsStore(context) }
    var settings by remember(store) { mutableStateOf(store.load()) }
    var volumeDraft by remember(settings.volumePercent) { mutableIntStateOf(settings.volumePercent) }
    var permissionRevision by remember { mutableIntStateOf(0) }
    var notice by remember { mutableStateOf<String?>(null) }

    fun update(transform: (WakeCallSettings) -> WakeCallSettings) {
        settings = transform(settings)
        store.save(settings)
        notice = null
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) permissionRevision++
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val contactPicker = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uri = result.data?.data
        if (result.resultCode == android.app.Activity.RESULT_OK && uri != null) {
            runCatching {
                context.contentResolver.query(
                    uri,
                    arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
                    null, null, null
                )?.use { cursor ->
                    if (cursor.moveToFirst()) cursor.getString(0) else null
                }
            }.getOrNull()?.let { number ->
                val normalized = PhoneNumberUtils.normalizeNumber(number)
                if (normalized.isNotBlank()) {
                    update { it.copy(selectedNumbers = it.selectedNumbers + normalized) }
                } else notice = "This contact has no usable phone number."
            } ?: run { notice = "Choose a contact with a phone number." }
        }
    }
    val contactsPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionRevision++
        if (granted) {
            contactPicker.launch(Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI))
        } else notice = "Allow Contacts to choose who can wake you."
    }
    val phonePermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        permissionRevision++
    }
    val roleRequest = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        permissionRevision++
    }

    // Reading the counter makes permission state refresh when returning from system settings.
    @Suppress("UNUSED_VARIABLE") val revision = permissionRevision
    val hasContacts = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
    val hasPhoneState = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
    val roleManager = remember(context) { context.getSystemService(RoleManager::class.java) }
    val hasScreeningRole = roleManager?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) == true
    val notificationManager = context.getSystemService(NotificationManager::class.java)
    val hasDndAccess = notificationManager?.isNotificationPolicyAccessGranted == true
    val readiness = WakeCallReadiness.inspect(context)
    val dndBlocking = readiness == WakeCallStatus.PAUSED_BY_DND
    val ready = readiness == WakeCallStatus.READY && settings.selectedNumbers.isNotEmpty()

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        EyebrowBadge("PHONE ONLY · TOOLS")
        Text("Priority wake calls", style = Typography.headlineLarge)
        Text(
            "During your chosen window, selected callers can ring at your wake volume. Other incoming calls are silenced but still shown. Outside the window, your phone settings apply.",
            style = Typography.bodyMedium.copy(color = ForestMuted)
        )

        GlassPanel(backgroundColor = ForestPanel2) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Wake calls", style = Typography.titleMedium.copy(color = ForestText, fontWeight = FontWeight.Bold))
                    Text(
                        if (!settings.enabled) "Off"
                        else if (dndBlocking) "Paused by Do Not Disturb"
                        else if (settings.selectedNumbers.isEmpty()) "Choose at least one contact"
                        else if (ready) "Ready for selected callers"
                        else "Setup needed before this can work",
                        style = Typography.bodySmall.copy(color = if (settings.enabled && ready) StatusGood else ForestMuted)
                    )
                }
                Switch(
                    checked = settings.enabled,
                    onCheckedChange = { checked -> update { it.copy(enabled = checked) } },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = ForestDarkText,
                        checkedTrackColor = ForestAccent,
                        uncheckedThumbColor = ForestMuted,
                        uncheckedTrackColor = ForestPanel2
                    )
                )
            }
        }

        GlassPanel {
            SectionHeading("WHEN")
            Text("Active window", style = Typography.titleMedium.copy(color = ForestText))
            Text("Calls must begin inside this window. Overnight windows are supported.", style = Typography.bodySmall.copy(color = ForestMuted))
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                ActionButton("From ${formatMinute(settings.startMinute)}", Modifier.weight(1f)) {
                    showTimePicker(context, settings.startMinute) { minute ->
                        if (minute == settings.endMinute) notice = "Start and end times must differ."
                        else update { it.copy(startMinute = minute) }
                    }
                }
                ActionButton("To ${formatMinute(settings.endMinute)}", Modifier.weight(1f)) {
                    showTimePicker(context, settings.endMinute) { minute ->
                        if (minute == settings.startMinute) notice = "Start and end times must differ."
                        else update { it.copy(endMinute = minute) }
                    }
                }
            }
        }

        GlassPanel {
            SectionHeading("WHO")
            Text("Selected contacts", style = Typography.titleMedium.copy(color = ForestText))
            Text("Only these numbers trigger the wake sound. Contacts stay on this phone.", style = Typography.bodySmall.copy(color = ForestMuted))
            Spacer(Modifier.height(12.dp))
            ActionButton("Choose contact", Modifier.fillMaxWidth()) {
                if (hasContacts) contactPicker.launch(Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI))
                else contactsPermission.launch(Manifest.permission.READ_CONTACTS)
            }
            if (settings.selectedNumbers.isEmpty()) {
                Spacer(Modifier.height(12.dp))
                Text("No contacts selected", style = Typography.bodyMedium.copy(color = StatusWarning))
            } else {
                settings.selectedNumbers.sorted().forEach { number ->
                    HorizontalDivider(modifier = Modifier.padding(vertical = 10.dp))
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(contactName(context, number, hasContacts) ?: "Selected number", style = Typography.bodyMedium.copy(color = ForestText, fontWeight = FontWeight.SemiBold))
                            Text(number, style = Typography.bodySmall.copy(color = ForestMuted))
                        }
                        ActionButton("Remove", Modifier) {
                            update { it.copy(selectedNumbers = it.selectedNumbers - number) }
                        }
                    }
                }
            }
        }

        GlassPanel {
            SectionHeading("SOUND")
            Text("Wake volume · $volumeDraft%", style = Typography.titleMedium.copy(color = ForestText))
            Text("Sets ring volume for selected calls, then restores the previous level after the call.", style = Typography.bodySmall.copy(color = ForestMuted))
            Slider(
                value = volumeDraft.toFloat(),
                onValueChange = { value -> volumeDraft = value.roundToInt().coerceIn(20, 100) },
                onValueChangeFinished = { update { it.copy(volumePercent = volumeDraft) } },
                valueRange = 20f..100f,
                steps = 7,
                colors = SliderDefaults.colors(thumbColor = ForestAccent, activeTrackColor = ForestAccent, inactiveTrackColor = ForestMuted)
            )
        }

        GlassPanel {
            SectionHeading("SETUP")
            Text("Phone access", style = Typography.titleMedium.copy(color = ForestText))
            Text("Android needs these permissions to identify a selected caller and restore your sound settings.", style = Typography.bodySmall.copy(color = ForestMuted))
            Spacer(Modifier.height(10.dp))
            SetupRow("Contacts", hasContacts, "Allow") { contactsPermission.launch(Manifest.permission.READ_CONTACTS) }
            SetupRow("Phone state", hasPhoneState, "Allow") { phonePermission.launch(Manifest.permission.READ_PHONE_STATE) }
            SetupRow("Caller screening role", hasScreeningRole, "Choose app") {
                if (roleManager?.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) == true) {
                    roleRequest.launch(roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING))
                } else notice = "Caller screening is unavailable on this phone."
            }
            SetupRow("Do Not Disturb access", hasDndAccess, "Open settings") {
                context.startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
            }
        }

        Text(
            "An active Do Not Disturb rule pauses wake calls on Android 16. Keep the phone on silent or vibrate if you want other notifications quiet, and test with a selected caller before relying on this feature.",
            style = Typography.bodySmall.copy(color = ForestMuted)
        )
        notice?.let { Text(it, style = Typography.bodySmall.copy(color = StatusWarning)) }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun SectionHeading(text: String) {
    EyebrowBadge(text)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun SetupRow(label: String, granted: Boolean, action: String, onClick: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = Typography.bodyMedium.copy(color = ForestText))
            Text(if (granted) "Ready" else "Needed", style = Typography.bodySmall.copy(color = if (granted) StatusGood else StatusWarning))
        }
        if (!granted) ActionButton(action, Modifier, onClick)
    }
}

@Composable
private fun ActionButton(label: String, modifier: Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = modifier.sizeIn(minHeight = 48.dp),
        colors = ButtonDefaults.buttonColors(containerColor = ForestAccent, contentColor = ForestDarkText)
    ) {
        Text(label, style = Typography.bodySmall.copy(color = ForestDarkText, fontWeight = FontWeight.Bold))
    }
}

private fun formatMinute(minute: Int): String = String.format(Locale.getDefault(), "%02d:%02d", minute / 60, minute % 60)

private fun showTimePicker(context: android.content.Context, selected: Int, onSelected: (Int) -> Unit) {
    TimePickerDialog(context, { _, hour, minute -> onSelected(hour * 60 + minute) }, selected / 60, selected % 60, false).show()
}

private fun contactName(context: android.content.Context, number: String, hasPermission: Boolean): String? {
    if (!hasPermission) return null
    val uri = android.net.Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, android.net.Uri.encode(number))
    return runCatching {
        context.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        }
    }.getOrNull()
}
