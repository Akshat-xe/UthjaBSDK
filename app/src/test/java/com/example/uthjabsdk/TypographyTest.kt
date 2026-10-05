package com.example.uthjabsdk

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.takeOrElse
import androidx.compose.ui.text.TextStyle
import com.example.uthjabsdk.core.design.ForestDarkText
import com.example.uthjabsdk.core.design.ForestText
import org.junit.Test
import org.junit.Assert.*

class TypographyTest {
    @Test
    fun testUnspecifiedTypographyAllowsLocalContentColor() {
        val parentStyle = TextStyle(color = Color.Unspecified)
        val buttonStyle = TextStyle(color = Color.Unspecified)
        val merged = parentStyle.merge(buttonStyle)

        val explicitColor = Color.Unspecified
        val localContentColor = ForestDarkText

        val effectiveColor = explicitColor.takeOrElse {
            merged.color.takeOrElse { localContentColor }
        }

        assertEquals(ForestDarkText, effectiveColor)
    }
}
