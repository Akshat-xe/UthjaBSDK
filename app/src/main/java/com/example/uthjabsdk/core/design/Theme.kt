package com.example.uthjabsdk.core.design

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = ForestAccent,
    onPrimary = ForestDarkText,
    primaryContainer = ForestPanel2,
    onPrimaryContainer = ForestText,
    secondary = ForestGreen,
    onSecondary = ForestDarkText,
    secondaryContainer = ForestPanel2,
    onSecondaryContainer = ForestText,
    tertiary = ForestPeach,
    onTertiary = ForestDarkText,
    background = ForestBg,
    onBackground = ForestText,
    surface = ForestPanel,
    onSurface = ForestText,
    surfaceVariant = ForestPanel2,
    onSurfaceVariant = ForestMuted,
    outline = ForestLine,
    error = StatusDanger,
    onError = ForestDarkText
)

@Composable
fun UthJaBSDKTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
