package com.example.uthjabsdk.feature.sync

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.window.Dialog
import com.example.uthjabsdk.core.design.EyebrowBadge
import com.example.uthjabsdk.core.design.ForestAccent
import com.example.uthjabsdk.core.design.ForestDarkText
import com.example.uthjabsdk.core.design.ForestLine
import com.example.uthjabsdk.core.design.ForestMuted
import com.example.uthjabsdk.core.design.ForestPanel
import com.example.uthjabsdk.core.design.ForestPanel2
import com.example.uthjabsdk.core.design.ForestText
import com.example.uthjabsdk.core.design.GlassPanel
import com.example.uthjabsdk.core.design.StatusDanger
import com.example.uthjabsdk.core.design.StatusGood
import com.example.uthjabsdk.core.design.StatusWarning
import com.example.uthjabsdk.core.design.Typography
import com.example.uthjabsdk.core.design.UthJaIcons
import com.example.uthjabsdk.core.model.SyncOverallState
import com.example.uthjabsdk.core.model.SyncSourceState
import com.example.uthjabsdk.core.model.SyncSourceStateStatus
import com.example.uthjabsdk.core.model.SyncStatus

/**
 * Global manual Sync UI control dialog matching website UpdateControl,
 * enhanced with secure pairing status and Keystore credentials modal.
 *
 * Calls dataSource.triggerSync() on tap.
 * Reflects pending/running/success/stale/error states from injected interface.
 * Never pretends demo data is freshly synced.
 */
@Composable
fun SyncControlDialog(
    syncStatus: SyncStatus,
    onTriggerSync: () -> Unit,
    onDismiss: () -> Unit,
    pairingEndpoint: String? = null,
    hasReadToken: Boolean = false,
    onSavePairing: ((endpoint: String, token: String?) -> Unit)? = null,
    onClearPairing: (() -> Unit)? = null
) {
    var showPairingModal by remember { mutableStateOf(false) }

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
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        EyebrowBadge(text = "CAMPUS DATA")
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = when (syncStatus.overallState) {
                                SyncOverallState.RUNNING -> "Your updates are in progress"
                                SyncOverallState.ERROR -> "Update could not start"
                                SyncOverallState.PARTIAL -> "Some sources need attention"
                                else -> "Update your campus data"
                            },
                            style = Typography.headlineSmall.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = UthJaIcons.Close,
                            contentDescription = "Close",
                            tint = ForestMuted
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Text(
                    text = when {
                        syncStatus.isRunning -> "Bringing the latest saved campus data to this phone."
                        syncStatus.errorMessage != null -> syncStatus.errorMessage
                        else -> "Tap Sync now to bring your laptop's latest update to this phone."
                    },
                    style = Typography.bodyMedium.copy(color = ForestMuted)
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Progress Bar
                if (syncStatus.isRunning) {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp)),
                        color = ForestAccent,
                        trackColor = ForestPanel2
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(ForestPanel2)
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Secure Pairing Banner Card
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(ForestPanel2)
                        .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(12.dp))
                        .padding(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                val statusColor = if (!pairingEndpoint.isNullOrBlank()) StatusGood else StatusWarning
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .clip(CircleShape)
                                        .background(statusColor)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = if (!pairingEndpoint.isNullOrBlank()) "PHONE CONNECTED" else "PHONE NOT CONNECTED",
                                    style = Typography.bodySmall.copy(
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = statusColor,
                                        letterSpacing = 0.5.sp
                                    )
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            if (!pairingEndpoint.isNullOrBlank()) {
                                Text(
                                    text = pairingEndpoint.take(32) + if (pairingEndpoint.length > 32) "…" else "",
                                    style = Typography.bodySmall.copy(color = ForestText, fontSize = 12.sp)
                                )
                                Text(
                                    text = if (hasReadToken) "Private access saved securely" else "Read token required",
                                    style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp)
                                )
                            } else {
                                Text(
                                    text = "This phone is not paired",
                                    style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 12.sp)
                                )
                                Text(
                                    text = "Tap Pair to connect your campus data",
                                    style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp)
                                )
                            }
                        }

                        if (onSavePairing != null) {
                            TextButton(
                                onClick = { showPairingModal = true },
                                modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                                colors = ButtonDefaults.textButtonColors(contentColor = ForestAccent)
                            ) {
                                Text(
                                    text = if (pairingEndpoint.isNullOrBlank()) "Pair" else "Edit",
                                    color = ForestAccent,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Sources list
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    syncStatus.sources.values.forEach { source ->
                        SyncSourceRow(source)
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Last updated footer
                Text(
                    text = if (syncStatus.isRunning) "Sync in progress…"
                    else "Last imported: ${syncStatus.lastSyncTime ?: "Never"}" +
                            if (!syncStatus.revision.isNullOrBlank()) " · Version ${syncStatus.revision.takeLast(8)}" else "",
                    style = Typography.bodySmall.copy(color = ForestMuted)
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Button(
                        onClick = onTriggerSync,
                        enabled = !syncStatus.isRunning,
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
                        if (syncStatus.isRunning) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = ForestAccent,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Updating…", color = ForestMuted)
                        } else {
                            Text("Sync now ↻", fontWeight = FontWeight.Bold, color = ForestDarkText)
                        }
                    }

                    Button(
                        onClick = onDismiss,
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ForestPanel2,
                            contentColor = ForestText
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Close", color = ForestText)
                    }
                }
            }
        }
    }

    if (showPairingModal && onSavePairing != null) {
        PairingDialog(
            currentEndpoint = pairingEndpoint,
            hasConfiguredToken = hasReadToken,
            onSavePairing = { endpoint, token ->
                onSavePairing(endpoint, token)
                showPairingModal = false
            },
            onClearPairing = {
                onClearPairing?.invoke()
                showPairingModal = false
            },
            onDismiss = { showPairingModal = false }
        )
    }
}

@Composable
private fun SyncSourceRow(source: SyncSourceState) {
    val statusColor = when (source.status) {
        SyncSourceStateStatus.SUCCESS -> StatusGood
        SyncSourceStateStatus.PARTIAL -> StatusWarning
        SyncSourceStateStatus.FAILED -> StatusDanger
        SyncSourceStateStatus.RUNNING -> ForestAccent
        else -> ForestMuted
    }

    val statusText = when (source.status) {
        SyncSourceStateStatus.RUNNING -> "In progress"
        SyncSourceStateStatus.SUCCESS -> "Done"
        SyncSourceStateStatus.PARTIAL -> "Partly updated"
        SyncSourceStateStatus.SETUP_REQUIRED -> "Setup needed"
        SyncSourceStateStatus.FAILED -> "Could not update"
        SyncSourceStateStatus.WAITING -> "Waiting"
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(ForestPanel2)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = source.label,
                style = Typography.titleMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            )
            if (!source.message.isNullOrBlank()) {
                Text(
                    text = source.message,
                    style = Typography.bodySmall.copy(color = ForestMuted, fontSize = 11.sp)
                )
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(statusColor)
            )
            Text(
                text = statusText,
                style = Typography.bodySmall.copy(
                    color = statusColor,
                    fontWeight = FontWeight.Medium,
                    fontSize = 12.sp
                )
            )
        }
    }
}
