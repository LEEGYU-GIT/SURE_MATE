# koffi blocked: the app must still start, show the palette on the hotkey, and explain lookups instead of crashing
param([string]$Combo = 'Alt+`')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$form = NewTestForm
$s0 = @(NewLogs 'palette.show').Count
Combo $Combo; Pump 900
$r.palette_show = @(NewLogs 'palette.show').Count - $s0
$r.palette_in_front = (IsApp)
if ((IsApp)) { Tap $VK['esc']; Pump 600 }
$r.hide = NewLogs 'palette.hide' | Select-Object -Last 1
$form.Activate(); Pump 300
Combo 'Ctrl+Alt+W'; Pump 3000
$r.capture = NewLogs 'wiki.card' | Select-Object -Last 1
$r.card_kept_focus = ((Fg).Title -eq 'SureMate-Test')
if ((IsApp)) { Tap $VK['esc']; Pump 500 }
$form.Close()
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
