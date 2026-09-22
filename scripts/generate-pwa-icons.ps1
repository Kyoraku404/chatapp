Add-Type -AssemblyName System.Drawing
$iconDir = Join-Path (Get-Location) 'public/icons'
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

function Save-RushIcon([int]$size, [string]$path, [bool]$maskable) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $red = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#D92D20'))
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
  if ($maskable) {
    $graphics.FillRectangle($red, 0, 0, $size, $size)
  } else {
    $radius = $size * 0.19
    $diameter = $radius * 2
    $shape.AddArc(0, 0, $diameter, $diameter, 180, 90)
    $shape.AddArc($size - $diameter, 0, $diameter, $diameter, 270, 90)
    $shape.AddArc($size - $diameter, $size - $diameter, $diameter, $diameter, 0, 90)
    $shape.AddArc(0, $size - $diameter, $diameter, $diameter, 90, 90)
    $shape.CloseFigure()
    $graphics.FillPath($red, $shape)
  }

  $scale = if ($maskable) { $size * 0.023 } else { $size * 0.035 }
  $x = if ($maskable) { $size * 0.225 } else { $size * 0.08 }
  $y = if ($maskable) { $size * 0.225 } else { $size * 0.08 }
  $vertices = @(
    @(13, 2), @(4.5, 13.5), @(11, 13.5), @(10, 22),
    @(18.5, 10.5), @(12, 10.5)
  )
  $points = [System.Drawing.PointF[]]@($vertices | ForEach-Object {
    [System.Drawing.PointF]::new([float]($x + $_[0] * $scale), [float]($y + $_[1] * $scale))
  })
  $bolt = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $bolt.AddPolygon($points)
  $graphics.FillPath($white, $bolt)
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bolt.Dispose(); $shape.Dispose(); $white.Dispose(); $red.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

Save-RushIcon 192 (Join-Path $iconDir 'rush-192.png') $false
Save-RushIcon 512 (Join-Path $iconDir 'rush-512.png') $false
Save-RushIcon 512 (Join-Path $iconDir 'rush-maskable-512.png') $true
Save-RushIcon 180 (Join-Path (Get-Location) 'public/apple-touch-icon.png') $false
