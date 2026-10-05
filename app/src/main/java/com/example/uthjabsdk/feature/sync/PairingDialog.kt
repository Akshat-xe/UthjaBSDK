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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
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
import com.example.uthjabsdk.core.design.StatusGood
import com.example.uthjabsdk.core.design.StatusWarning
import com.example.uthjabsdk.core.design.Typography
import com.example.uthjabsdk.core.design.UthJaIcons
import java.net.URI

/**
 * Secure Pairing Dialog for configuring Snapshot HTTPS endpoint and Keystore-protected read token.
 * Strictly adheres to the "no baked credentials" security policy.
 */
@Composable
fun PairingDialog(
    currentEndpoint: String?,
    hasConfiguredToken: Boolean,
    onSavePairing: (endpoint: String, token: String?) -> Unit,
    onClearPairing: () -> Unit,
    onDismiss: () -> Unit
) {
    var endpointInput by remember { mutableStateOf(currentEndpoint ?: "") }
    var tokenInput by remember { mutableStateOf("") }
    var showToken by remember { mutableStateOf(false) }
    var validationError by remember { mutableStateOf<String?>(null) }

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
                        EyebrowBadge(text = "SECURITY · KEYSTORE")
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "Convex Snapshot Pairing",
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
                    text = "Configure your private snapshot endpoint. Tokens are encrypted with AES-256-GCM via Android Keystore. No credentials are baked into the APK.",
                    style = Typography.bodySmall.copy(color = ForestMuted, lineHeight = 18.sp)
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Pending notice banner
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(ForestPanel2)
                        .border(BorderStroke(1.dp, ForestLine), RoundedCornerShape(12.dp))
                        .padding(12.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(StatusWarning)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Private Convex service is ready. Pair this phone to import the latest laptop snapshot.",
                            style = Typography.bodySmall.copy(color = StatusWarning, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // HTTPS Endpoint Field
                Text(
                    text = "SNAPSHOT HTTPS ENDPOINT",
                    style = Typography.bodySmall.copy(
                        color = ForestMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.sp
                    )
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = endpointInput,
                    onValueChange = {
                        endpointInput = it
                        validationError = null
                    },
                    placeholder = {
                        Text(
                            "https://<deployment>.convex.site/mobile/snapshot",
                            style = Typography.bodyMedium.copy(color = ForestMuted)
                        )
                    },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = ForestText,
                        unfocusedTextColor = ForestText,
                        focusedBorderColor = ForestAccent,
                        unfocusedBorderColor = ForestLine,
                        focusedContainerColor = ForestPanel2,
                        unfocusedContainerColor = ForestPanel2
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Read Token Field
                Text(
                    text = if (hasConfiguredToken) "READ TOKEN (CONFIGURED IN KEYSTORE)" else "READ TOKEN (BEARER)",
                    style = Typography.bodySmall.copy(
                        color = ForestMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.sp
                    )
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = tokenInput,
                    onValueChange = {
                        tokenInput = it
                        validationError = null
                    },
                    placeholder = {
                        Text(
                            if (hasConfiguredToken) "Leave blank to keep existing token" else "Paste read token",
                            style = Typography.bodyMedium.copy(color = ForestMuted)
                        )
                    },
                    visualTransformation = if (showToken) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { showToken = !showToken }) {
                            Icon(
                                imageVector = UthJaIcons.Notes,
                                contentDescription = "Toggle token visibility",
                                tint = ForestMuted
                            )
                        }
                    },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = ForestText,
                        unfocusedTextColor = ForestText,
                        focusedBorderColor = ForestAccent,
                        unfocusedBorderColor = ForestLine,
                        focusedContainerColor = ForestPanel2,
                        unfocusedContainerColor = ForestPanel2
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                if (validationError != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = validationError ?: "",
                        style = Typography.bodySmall.copy(color = ForestAccent, fontSize = 12.sp)
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Button(
                        onClick = {
                            val trimmed = endpointInput.trim()
                            if (trimmed.isBlank()) {
                                validationError = "Endpoint URL cannot be empty"
                                return@Button
                            }
                            val uri = try { URI(trimmed) } catch (_: Exception) { null }
                            if (uri?.scheme != "https" ||
                                uri.host?.endsWith(".convex.site") != true ||
                                uri.rawUserInfo != null || uri.rawQuery != null || uri.rawFragment != null ||
                                uri.rawPath != "/mobile/snapshot") {
                                validationError = "Use your Convex HTTPS /mobile/snapshot URL"
                                return@Button
                            }
                            if (tokenInput.isBlank() && !hasConfiguredToken) {
                                validationError = "Read token is required for pairing"
                                return@Button
                            }
                            val newToken = tokenInput.trim().ifBlank { null }
                            onSavePairing(trimmed, newToken)
                            onDismiss()
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ForestAccent,
                            contentColor = ForestDarkText
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .weight(1f)
                            .defaultMinSize(minHeight = 48.dp)
                    ) {
                        Text("Save & Pair", fontWeight = FontWeight.Bold, color = ForestDarkText)
                    }

                    if (!currentEndpoint.isNullOrBlank()) {
                        Button(
                            onClick = {
                                onClearPairing()
                                onDismiss()
                            },
                            modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = ForestPanel2,
                                contentColor = ForestText
                            ),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Unpair", color = ForestText)
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
                        Text("Cancel", color = ForestText)
                    }
                }
            }
        }
    }
}
