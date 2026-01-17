package com.verateam.driverdisplay.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.verateam.driverdisplay.ui.theme.*

@Composable
fun Panel(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(6.dp)

    Column(
        modifier = modifier
            .clip(shape)
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Surface,
                        PanelBackground
                    )
                )
            )
            .border(1.dp, PanelBorder, shape)
            .padding(12.dp),
        content = content
    )
}

@Composable
fun DataLabel(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = OnSurfaceVariant,
        letterSpacing = 1.5.sp
    )
}

@Composable
fun DataValue(
    value: String,
    color: Color = OnSurface,
    size: DataValueSize = DataValueSize.Large,
    modifier: Modifier = Modifier
) {
    Text(
        text = value,
        style = MaterialTheme.typography.displayLarge.copy(
            fontSize = when (size) {
                DataValueSize.Small -> 24.sp
                DataValueSize.Medium -> 36.sp
                DataValueSize.Large -> 48.sp
                DataValueSize.XLarge -> 72.sp
            },
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp
        ),
        color = color,
        modifier = modifier
    )
}

enum class DataValueSize {
    Small, Medium, Large, XLarge
}
