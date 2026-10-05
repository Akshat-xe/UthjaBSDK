package com.example.uthjabsdk.core.design

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * UthJaIcons provides self-contained ImageVectors for Uth ja BSDK navigation, routine, and action glyphs.
 */
object UthJaIcons {
    val Routine: ImageVector = createCustomVector("routine") {
        moveTo(10f, 20f)
        lineTo(10f, 14f)
        lineTo(14f, 14f)
        lineTo(14f, 20f)
        lineTo(19f, 20f)
        lineTo(19f, 12f)
        lineTo(22f, 12f)
        lineTo(12f, 3f)
        lineTo(2f, 12f)
        lineTo(5f, 12f)
        lineTo(5f, 20f)
        close()
    }

    val Academic: ImageVector = createCustomVector("academic") {
        moveTo(19f, 4f)
        lineTo(18f, 4f)
        lineTo(18f, 2f)
        lineTo(16f, 2f)
        lineTo(16f, 4f)
        lineTo(8f, 4f)
        lineTo(8f, 2f)
        lineTo(6f, 2f)
        lineTo(6f, 4f)
        lineTo(5f, 4f)
        curveTo(3.89f, 4f, 3f, 4.9f, 3f, 6f)
        lineTo(3f, 20f)
        curveTo(3f, 21.1f, 3.89f, 22f, 5f, 22f)
        lineTo(19f, 22f)
        curveTo(20.1f, 22f, 21f, 21.1f, 21f, 20f)
        lineTo(21f, 6f)
        curveTo(21f, 4.9f, 20.1f, 4f, 19f, 4f)
        close()
        moveTo(19f, 20f)
        lineTo(5f, 20f)
        lineTo(5f, 9f)
        lineTo(19f, 9f)
        close()
    }

    val Attendance: ImageVector = createCustomVector("attendance") {
        moveTo(4f, 20f)
        lineTo(4f, 13f)
        lineTo(8f, 13f)
        lineTo(8f, 20f)
        close()
        moveTo(10f, 20f)
        lineTo(10f, 9f)
        lineTo(14f, 9f)
        lineTo(14f, 20f)
        close()
        moveTo(16f, 20f)
        lineTo(16f, 4f)
        lineTo(20f, 4f)
        lineTo(20f, 20f)
        close()
    }

    val Mail: ImageVector = createCustomVector("mail") {
        moveTo(20f, 4f)
        lineTo(4f, 4f)
        curveTo(2.9f, 4f, 2f, 4.9f, 2f, 6f)
        lineTo(2f, 18f)
        curveTo(2f, 19.1f, 2.9f, 20f, 4f, 20f)
        lineTo(20f, 20f)
        curveTo(21.1f, 20f, 22f, 19.1f, 22f, 18f)
        lineTo(22f, 6f)
        curveTo(22f, 4.9f, 21.1f, 4f, 20f, 4f)
        close()
        moveTo(20f, 8f)
        lineTo(12f, 13f)
        lineTo(4f, 8f)
        lineTo(4f, 6f)
        lineTo(12f, 11f)
        lineTo(20f, 6f)
        close()
    }

    val Notes: ImageVector = createCustomVector("notes") {
        moveTo(19f, 3f)
        lineTo(5f, 3f)
        curveTo(3.9f, 3f, 3f, 3.9f, 3f, 5f)
        lineTo(3f, 19f)
        curveTo(3f, 20.1f, 3.9f, 21f, 5f, 21f)
        lineTo(19f, 21f)
        curveTo(20.1f, 21f, 21f, 20.1f, 21f, 19f)
        lineTo(21f, 5f)
        curveTo(21f, 3.9f, 20.1f, 3f, 19f, 3f)
        close()
        moveTo(7f, 7f)
        lineTo(17f, 7f)
        lineTo(17f, 9f)
        lineTo(7f, 9f)
        close()
        moveTo(7f, 11f)
        lineTo(17f, 11f)
        lineTo(17f, 13f)
        lineTo(7f, 13f)
        close()
        moveTo(7f, 15f)
        lineTo(13f, 15f)
        lineTo(13f, 17f)
        lineTo(7f, 17f)
        close()
    }

    val Tools: ImageVector = createCustomVector("tools") {
        moveTo(22.7f, 19.3f)
        lineTo(16.5f, 13.1f)
        curveTo(17.4f, 11.5f, 17.2f, 9.4f, 15.8f, 8f)
        curveTo(14.4f, 6.6f, 12.4f, 6.3f, 10.7f, 7.1f)
        lineTo(14.3f, 10.7f)
        lineTo(12.7f, 12.3f)
        lineTo(9.1f, 8.7f)
        curveTo(8.3f, 10.4f, 8.6f, 12.4f, 10f, 13.8f)
        curveTo(11.4f, 15.2f, 13.5f, 15.4f, 15.1f, 14.5f)
        lineTo(21.3f, 20.7f)
        close()
    }

    val Food: ImageVector = createCustomVector("food") {
        moveTo(6f, 3f)
        lineTo(6f, 11f)
        curveTo(6f, 12.1f, 6.9f, 13f, 8f, 13f)
        lineTo(8f, 21f)
        lineTo(10f, 21f)
        lineTo(10f, 13f)
        curveTo(11.1f, 13f, 12f, 12.1f, 12f, 11f)
        lineTo(12f, 3f)
        close()
        moveTo(16f, 3f)
        lineTo(16f, 21f)
        lineTo(18f, 21f)
        lineTo(18f, 13f)
        lineTo(20f, 13f)
        curveTo(20f, 7.5f, 18f, 3f, 16f, 3f)
        close()
    }

    val Hostel: ImageVector = createCustomVector("hostel") {
        moveTo(20f, 6f)
        lineTo(16f, 6f)
        lineTo(16f, 4f)
        curveTo(16f, 2.9f, 15.1f, 2f, 14f, 2f)
        lineTo(10f, 2f)
        curveTo(8.9f, 2f, 8f, 2.9f, 8f, 4f)
        lineTo(8f, 6f)
        lineTo(4f, 6f)
        curveTo(2.9f, 6f, 2f, 6.9f, 2f, 8f)
        lineTo(2f, 19f)
        curveTo(2f, 20.1f, 2.9f, 21f, 4f, 21f)
        lineTo(20f, 21f)
        curveTo(21.1f, 21f, 22f, 20.1f, 22f, 19f)
        lineTo(22f, 8f)
        curveTo(22f, 6.9f, 21.1f, 6f, 20f, 6f)
        close()
        moveTo(10f, 4f)
        lineTo(14f, 4f)
        lineTo(14f, 6f)
        lineTo(10f, 6f)
        close()
    }

    val Radar: ImageVector = createCustomVector("radar") {
        moveTo(12f, 2f)
        curveTo(6.5f, 2f, 2f, 6.5f, 2f, 12f)
        curveTo(2f, 17.5f, 6.5f, 22f, 12f, 22f)
        curveTo(17.5f, 22f, 22f, 17.5f, 22f, 12f)
        curveTo(22f, 6.5f, 17.5f, 2f, 12f, 2f)
        close()
        moveTo(12f, 6f)
        curveTo(8.7f, 6f, 6f, 8.7f, 6f, 12f)
        curveTo(6f, 15.3f, 8.7f, 18f, 12f, 18f)
        curveTo(15.3f, 18f, 18f, 15.3f, 18f, 12f)
        close()
        moveTo(12f, 10f)
        curveTo(10.9f, 10f, 10f, 10.9f, 10f, 12f)
        curveTo(10f, 13.1f, 10.9f, 14f, 12f, 14f)
        curveTo(13.1f, 14f, 14f, 13.1f, 14f, 12f)
        close()
    }

    val Reports: ImageVector = createCustomVector("reports") {
        moveTo(3.5f, 18.5f)
        lineTo(9.5f, 12.5f)
        lineTo(13.5f, 16.5f)
        lineTo(20.5f, 9.5f)
        moveTo(20.5f, 14f)
        lineTo(20.5f, 9.5f)
        lineTo(16f, 9.5f)
    }

    val WaterDrop: ImageVector = createCustomVector("water_drop") {
        moveTo(12f, 3.5f)
        curveTo(12f, 3.5f, 6f, 10.5f, 6f, 15f)
        curveTo(6f, 18.3f, 8.7f, 21f, 12f, 21f)
        curveTo(15.3f, 21f, 18f, 18.3f, 18f, 15f)
        curveTo(18f, 10.5f, 12f, 3.5f, 12f, 3.5f)
        close()
    }

    val Sun: ImageVector = createCustomVector("sun") {
        moveTo(12f, 7f)
        curveTo(9.2f, 7f, 7f, 9.2f, 7f, 12f)
        curveTo(7f, 14.8f, 9.2f, 17f, 12f, 17f)
        curveTo(14.8f, 17f, 17f, 14.8f, 17f, 12f)
        close()
        moveTo(12f, 2f)
        lineTo(12f, 5f)
        moveTo(12f, 19f)
        lineTo(12f, 22f)
        moveTo(2f, 12f)
        lineTo(5f, 12f)
        moveTo(19f, 12f)
        lineTo(22f, 12f)
    }

    val Moon: ImageVector = createCustomVector("moon") {
        moveTo(12.3f, 2f)
        curveTo(6.9f, 2.3f, 2.5f, 6.9f, 2.5f, 12.4f)
        curveTo(2.5f, 18f, 7f, 22.5f, 12.6f, 22.5f)
        curveTo(16.5f, 22.5f, 19.9f, 20.3f, 21.6f, 17f)
        curveTo(13.4f, 17.5f, 8.5f, 10.6f, 12.3f, 2f)
        close()
    }

    val Backpack: ImageVector = createCustomVector("backpack") {
        moveTo(6f, 8f)
        lineTo(18f, 8f)
        curveTo(19.1f, 8f, 20f, 8.9f, 20f, 10f)
        lineTo(20f, 20f)
        curveTo(20f, 21.1f, 19.1f, 22f, 18f, 22f)
        lineTo(6f, 22f)
        curveTo(4.9f, 22f, 4f, 21.1f, 4f, 20f)
        lineTo(4f, 10f)
        curveTo(4f, 8.9f, 4.9f, 8f, 6f, 8f)
        close()
        moveTo(9f, 8f)
        lineTo(9f, 5f)
        curveTo(9f, 3.9f, 10.3f, 3f, 12f, 3f)
        curveTo(13.7f, 3f, 15f, 3.9f, 15f, 5f)
        lineTo(15f, 8f)
    }

    val Check: ImageVector = createCustomVector("check") {
        moveTo(9f, 16.2f)
        lineTo(4.8f, 12f)
        lineTo(3.4f, 13.4f)
        lineTo(9f, 19f)
        lineTo(21f, 7f)
        lineTo(19.6f, 5.6f)
        close()
    }

    val Close: ImageVector = createCustomVector("close") {
        moveTo(19f, 6.4f)
        lineTo(17.6f, 5f)
        lineTo(12f, 10.6f)
        lineTo(6.4f, 5f)
        lineTo(5f, 6.4f)
        lineTo(10.6f, 12f)
        lineTo(5f, 17.6f)
        lineTo(6.4f, 19f)
        lineTo(12f, 13.4f)
        lineTo(17.6f, 19f)
        lineTo(19f, 17.6f)
        lineTo(13.4f, 12f)
        close()
    }

    val Star: ImageVector = createCustomVector("star") {
        moveTo(12f, 17.27f)
        lineTo(18.18f, 21f)
        lineTo(16.54f, 13.97f)
        lineTo(22f, 9.24f)
        lineTo(14.81f, 8.63f)
        lineTo(12f, 2f)
        lineTo(9.19f, 8.63f)
        lineTo(2f, 9.24f)
        lineTo(7.46f, 13.97f)
        lineTo(5.82f, 21f)
        close()
    }

    val Refresh: ImageVector = createCustomVector("refresh") {
        moveTo(17.65f, 6.35f)
        curveTo(16.2f, 4.9f, 14.21f, 4f, 12f, 4f)
        curveTo(7.58f, 4f, 4.01f, 7.58f, 4.01f, 12f)
        curveTo(4.01f, 16.42f, 7.58f, 20f, 12f, 20f)
        curveTo(15.73f, 20f, 18.84f, 17.45f, 19.73f, 14f)
        lineTo(17.65f, 14f)
        curveTo(16.83f, 16.33f, 14.61f, 18f, 12f, 18f)
        curveTo(8.69f, 18f, 6f, 15.31f, 6f, 12f)
        curveTo(6f, 8.69f, 8.69f, 6f, 12f, 6f)
        curveTo(13.66f, 6f, 15.14f, 6.69f, 16.22f, 7.78f)
        lineTo(13f, 11f)
        lineTo(20f, 11f)
        lineTo(20f, 4f)
        close()
    }

    val ArrowBack: ImageVector = createCustomVector("arrow_back") {
        moveTo(20f, 11f)
        lineTo(7.83f, 11f)
        lineTo(13.42f, 5.41f)
        lineTo(12f, 4f)
        lineTo(4f, 12f)
        lineTo(12f, 20f)
        lineTo(13.41f, 18.59f)
        lineTo(7.83f, 13f)
        lineTo(20f, 13f)
        close()
    }

    val ChevronLeft: ImageVector = createCustomVector("chevron_left") {
        moveTo(15.41f, 7.41f)
        lineTo(14f, 6f)
        lineTo(8f, 12f)
        lineTo(14f, 18f)
        lineTo(15.41f, 16.59f)
        lineTo(10.83f, 12f)
        close()
    }

    val ChevronRight: ImageVector = createCustomVector("chevron_right") {
        moveTo(10f, 6f)
        lineTo(8.59f, 7.41f)
        lineTo(13.17f, 12f)
        lineTo(8.59f, 16.59f)
        lineTo(10f, 18f)
        lineTo(16f, 12f)
        close()
    }

    val ChevronDown: ImageVector = createCustomVector("chevron_down") {
        moveTo(7.41f, 8.59f)
        lineTo(12f, 13.17f)
        lineTo(16.59f, 8.59f)
        lineTo(18f, 10f)
        lineTo(12f, 16f)
        lineTo(6f, 10f)
        close()
    }

    val ChevronUp: ImageVector = createCustomVector("chevron_up") {
        moveTo(7.41f, 15.41f)
        lineTo(12f, 10.83f)
        lineTo(16.59f, 15.41f)
        lineTo(18f, 14f)
        lineTo(12f, 8f)
        lineTo(6f, 14f)
        close()
    }

    val Alarm: ImageVector = createCustomVector("alarm") {
        moveTo(12f, 22f)
        curveTo(13.1f, 22f, 14f, 21.1f, 14f, 20f)
        lineTo(10f, 20f)
        curveTo(10f, 21.1f, 10.9f, 22f, 12f, 22f)
        close()
        moveTo(18f, 16f)
        lineTo(18f, 11f)
        curveTo(18f, 7.93f, 16.37f, 5.36f, 13.5f, 4.68f)
        lineTo(13.5f, 4f)
        curveTo(13.5f, 3.17f, 12.83f, 2.5f, 12f, 2.5f)
        curveTo(11.17f, 2.5f, 10.5f, 3.17f, 10.5f, 4f)
        lineTo(10.5f, 4.68f)
        curveTo(7.64f, 5.36f, 6f, 7.92f, 6f, 11f)
        lineTo(6f, 16f)
        lineTo(4f, 18f)
        lineTo(4f, 19f)
        lineTo(20f, 19f)
        lineTo(20f, 18f)
        lineTo(18f, 16f)
        close()
    }

    val Share: ImageVector = createCustomVector("share") {
        moveTo(18f, 16.08f)
        curveTo(17.24f, 16.08f, 16.56f, 16.38f, 16.04f, 16.85f)
        lineTo(8.91f, 12.7f)
        curveTo(8.96f, 12.47f, 9f, 12.24f, 9f, 12f)
        curveTo(9f, 11.76f, 8.96f, 11.53f, 8.91f, 11.3f)
        lineTo(15.96f, 7.19f)
        curveTo(16.5f, 7.69f, 17.21f, 8f, 18f, 8f)
        curveTo(19.66f, 8f, 21f, 6.66f, 21f, 5f)
        curveTo(21f, 3.34f, 19.66f, 2f, 18f, 2f)
        curveTo(16.34f, 2f, 15f, 3.34f, 15f, 5f)
        curveTo(15f, 5.24f, 15.04f, 5.47f, 15.09f, 5.7f)
        lineTo(8.04f, 9.81f)
        curveTo(7.5f, 9.31f, 6.79f, 9f, 6f, 9f)
        curveTo(4.34f, 9f, 3f, 10.34f, 3f, 12f)
        curveTo(3f, 13.66f, 4.34f, 15f, 6f, 15f)
        curveTo(6.79f, 15f, 7.5f, 14.69f, 8.04f, 14.19f)
        lineTo(15.16f, 18.35f)
        curveTo(15.11f, 18.56f, 15.08f, 18.78f, 15.08f, 19f)
        curveTo(15.08f, 20.61f, 16.39f, 21.92f, 18f, 21.92f)
        curveTo(19.61f, 21.92f, 20.92f, 20.61f, 20.92f, 19f)
        curveTo(20.92f, 17.39f, 19.61f, 16.08f, 18f, 16.08f)
        close()
    }
}

private inline fun createCustomVector(
    name: String,
    crossinline pathBuilder: androidx.compose.ui.graphics.vector.PathBuilder.() -> Unit
): ImageVector {
    return ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f
    ).path(
        fill = SolidColor(Color.White),
        fillAlpha = 1.0f,
        stroke = null,
        strokeAlpha = 1.0f,
        strokeLineWidth = 1.5f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
        strokeLineMiter = 4.0f,
        pathFillType = PathFillType.NonZero
    ) {
        pathBuilder()
    }.build()
}
