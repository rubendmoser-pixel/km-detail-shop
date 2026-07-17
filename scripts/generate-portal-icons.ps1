Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot "assets\icon-512.png"
$source = [System.Drawing.Image]::FromFile($sourcePath)
$apps = @(
  @{ Name = "ventas"; Letter = "V"; Color = "#858BFF" },
  @{ Name = "logistica"; Letter = "L"; Color = "#52C981" },
  @{ Name = "admin"; Letter = "A"; Color = "#5FB3FF" },
  @{ Name = "produccion"; Letter = "P"; Color = "#F1C94A" }
)

foreach ($app in $apps) {
  foreach ($size in @(192, 512)) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, $size, $size)
    $badgeSize = [single]($size * 0.29)
    $badgeX = [single]($size * 0.60)
    $badgeY = [single]($size * 0.60)
    $badgeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($app.Color))
    $graphics.FillEllipse($badgeBrush, $badgeX, $badgeY, $badgeSize, $badgeSize)
    $outline = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [single]($size * 0.012))
    $graphics.DrawEllipse($outline, $badgeX, $badgeY, $badgeSize, $badgeSize)
    $font = New-Object System.Drawing.Font("Arial", [single]($size * 0.17), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 8, 9, 11))
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString($app.Letter, $font, $textBrush, (New-Object System.Drawing.RectangleF($badgeX, $badgeY, $badgeSize, $badgeSize)), $format)
    $output = Join-Path $projectRoot ("assets\app-{0}-{1}.png" -f $app.Name, $size)
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
    $format.Dispose(); $textBrush.Dispose(); $font.Dispose(); $outline.Dispose(); $badgeBrush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
  }
}
$source.Dispose()
