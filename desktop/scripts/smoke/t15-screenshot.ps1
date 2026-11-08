# Palette screenshots for design review: empty query, "/" (prompt list). Saves PNGs to %TEMP%\sure-mate-smoke
param([string]$Combo = 'Alt+`', [string]$Typed = '/')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
Add-Type -AssemblyName System.Drawing
$work = Join-Path $env:TEMP 'sure-mate-smoke'; New-Item -ItemType Directory -Force $work | Out-Null

function Shot([string]$name) {
  $show = NewLogs 'palette.show' | Select-Object -Last 1 | ConvertFrom-Json
  $s = [double]$show.scale; $b = $show.bounds
  $x = [int]($b.x * $s); $y = [int]($b.y * $s); $w = [int]($b.width * $s); $h = [int]($b.height * $s)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size $w, $h))
  $path = Join-Path $work "$name.png"; $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
  "$name = $path ($w x $h)"
}

$form = NewTestForm
Combo $Combo; Pump 1200
if ((IsApp)) { Shot 'palette-empty' }
if ((IsApp)) { TypeAscii $Typed; Pump 700; Shot 'palette-typed' }
if ((IsApp)) { Tap $VK['esc']; Pump 500 }
$form.Close()
