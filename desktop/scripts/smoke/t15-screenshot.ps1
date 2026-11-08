# Palette screenshots for design review: empty query, typed text (default "/"). Saves PNGs to %TEMP%\sure-mate-smoke
param([string]$Combo = 'Alt+`', [string]$Typed = '/')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"

$form = NewTestForm
Combo $Combo; Pump 1200
if ((IsApp)) { Shot 'palette-empty' }
if ((IsApp)) { TypeAscii $Typed; Pump 700; Shot 'palette-typed' }
if ((IsApp)) { Tap $VK['esc']; Pump 500 }
$form.Close()
