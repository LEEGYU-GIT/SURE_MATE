# Task 8 smoke: palette "window" -> list (log), Esc; palette "monitor" -> move test form (log diff)
param([string]$Combo = 'Alt+`')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$form = NewTestForm
Combo $Combo; Pump 900
if ((IsApp)) {
  TypeAscii 'window'; Pump 300; Tap $VK['enter']; Pump 1500
  $r.list = NewLogs 'dev.listWindows' | Select-Object -Last 1
  Tap $VK['esc']; Pump 700
  $r.fg_after_esc = (Fg).Title
  Combo $Combo; Pump 900
  TypeAscii 'monitor'; Pump 300; Tap $VK['enter']; Pump 1500
  $r.move = NewLogs 'dev.moveWindow' | Select-Object -Last 1
  Tap $VK['esc']; Pump 700
  $r.fg_after_move = (Fg).Title
} else { $r.skipped = 'palette not in front' }
$form.Close()
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
