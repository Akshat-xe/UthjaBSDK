package com.example.uthjabsdk

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.takeOrElse
import androidx.compose.ui.text.TextStyle
import com.example.uthjabsdk.core.design.ForestAccent
import com.example.uthjabsdk.core.design.ForestDarkText
import com.example.uthjabsdk.core.design.ForestGreen
import com.example.uthjabsdk.core.design.ForestMuted
import com.example.uthjabsdk.core.design.ForestPanel
import com.example.uthjabsdk.core.design.ForestPanel2
import com.example.uthjabsdk.core.design.ForestPeach
import com.example.uthjabsdk.core.design.ForestText
import com.example.uthjabsdk.core.design.Typography
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Visual Accessibility Test Suite verifying WCAG 2.1 AA / AAA contrast compliance (min 4.5:1)
 * across all interactive states (active, disabled, completed) for the forest palette,
 * and confirming Typography styles preserve content color inheritance.
 */
class VisualAccessibilityContrastTest {

    private fun relativeLuminance(color: Color): Double {
        fun channelLuminance(c: Float): Double {
            val v = c.toDouble()
            return if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
        }
        val r = channelLuminance(color.red)
        val g = channelLuminance(color.green)
        val b = channelLuminance(color.blue)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    private fun contrastRatio(color1: Color, color2: Color): Double {
        val l1 = relativeLuminance(color1)
        val l2 = relativeLuminance(color2)
        val lighter = max(l1, l2)
        val darker = min(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
    }

    @Test
    fun testWcagContrast_ActiveAndCompletedButtonsOnForestAccent() {
        // Complete/Completed buttons use ForestDarkText on ForestAccent
        val ratio = contrastRatio(ForestDarkText, ForestAccent)
        assertTrue("Active/Completed button text contrast must be >= 4.5:1, was $ratio", ratio >= 4.5)
        assertTrue("ForestDarkText on ForestAccent meets WCAG AAA (>= 7.0:1), was $ratio", ratio >= 7.0)
    }

    @Test
    fun testWcagContrast_RegressionTest_ForestTextOnForestAccentFails() {
        // Before the fix, bodyLarge baked ForestText (#F0F2ED) onto ForestAccent (#DCECC7)
        val ratio = contrastRatio(ForestText, ForestAccent)
        assertTrue("Prior bug had illegible contrast ~1.10:1 (well below 4.5:1)", ratio < 2.0)
    }

    @Test
    fun testWcagContrast_StatusChipsAndBadges() {
        // ForestGreen chip (e.g. Present / Done) with ForestDarkText
        val greenRatio = contrastRatio(ForestDarkText, ForestGreen)
        assertTrue("ForestGreen chip contrast must be >= 4.5:1, was $greenRatio", greenRatio >= 4.5)

        // ForestPeach chip (e.g. Absent / Excused) with ForestDarkText
        val peachRatio = contrastRatio(ForestDarkText, ForestPeach)
        assertTrue("ForestPeach chip contrast must be >= 4.5:1, was $peachRatio", peachRatio >= 4.5)

        // Accent text on ForestPanel2 (e.g. Radar tier badges, TextButtons)
        val accentOnPanelRatio = contrastRatio(ForestAccent, ForestPanel2)
        assertTrue("ForestAccent on ForestPanel2 must be >= 4.5:1, was $accentOnPanelRatio", accentOnPanelRatio >= 4.5)
    }

    @Test
    fun testWcagContrast_SecondaryAndMutedButtonsOnDarkPanels() {
        // Secondary buttons (ForestPanel2 container, ForestText content)
        val textOnPanel2Ratio = contrastRatio(ForestText, ForestPanel2)
        assertTrue("ForestText on ForestPanel2 must be >= 4.5:1, was $textOnPanel2Ratio", textOnPanel2Ratio >= 4.5)

        // Disabled buttons and secondary text (ForestMuted on ForestPanel2)
        val mutedOnPanel2Ratio = contrastRatio(ForestMuted, ForestPanel2)
        assertTrue("ForestMuted on ForestPanel2 must be >= 4.5:1, was $mutedOnPanel2Ratio", mutedOnPanel2Ratio >= 4.5)

        // Secondary text on ForestPanel (ForestMuted on ForestPanel)
        val mutedOnPanelRatio = contrastRatio(ForestMuted, ForestPanel)
        assertTrue("ForestMuted on ForestPanel must be >= 4.5:1, was $mutedOnPanelRatio", mutedOnPanelRatio >= 4.5)
    }

    @Test
    fun testTypographyStyles_DoNotMaskButtonLocalContentColor() {
        // Typography definitions must have Color.Unspecified so TextStyle.merge() preserves child/LocalContentColor
        assertEquals(Color.Unspecified, Typography.bodyLarge.color)
        assertEquals(Color.Unspecified, Typography.bodyMedium.color)
        assertEquals(Color.Unspecified, Typography.bodySmall.color)
        assertEquals(Color.Unspecified, Typography.titleLarge.color)
        assertEquals(Color.Unspecified, Typography.titleMedium.color)
        assertEquals(Color.Unspecified, Typography.headlineLarge.color)
        assertEquals(Color.Unspecified, Typography.headlineSmall.color)
        assertEquals(Color.Unspecified, Typography.labelLarge.color)
        assertEquals(Color.Unspecified, Typography.labelMedium.color)
        assertEquals(Color.Unspecified, Typography.labelSmall.color)

        // Simulate Compose TextStyle.merge() and Text color resolution inside GlassPanel -> Button -> Text
        val parentStyle = Typography.bodyLarge
        val buttonStyle = Typography.labelLarge
        val merged = parentStyle.merge(buttonStyle)

        val explicitTextColor = Color.Unspecified
        val buttonContentColor = ForestDarkText

        val effectiveColor = explicitTextColor.takeOrElse {
            merged.color.takeOrElse { buttonContentColor }
        }

        assertEquals("Effective text color must be ForestDarkText, not overridden by parent typography", ForestDarkText, effectiveColor)
    }
}
