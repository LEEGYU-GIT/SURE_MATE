# Task 6 smoke: type "mc" + Enter -> wiki.mcdc runs once; reopen -> query empty (Enter runs first item)
param([string]$Combo = 'Alt+`')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$form = NewTestForm
$r.start = (Fg).Title
Combo $Combo; Pump 900
$r.fg_after_show = (Fg).Process
if ((IsApp)) {
  TypeAscii 'mc'; Pump 300
  Tap $VK['enter']; Pump 200; Tap $VK['enter']; Pump 700
  $r.runs_after_mc = (NewLogs 'palette.run' | ForEach-Object { ($_ | ConvertFrom-Json).id }) -join ','
  $r.fg_after_run = (Fg).Title
  Combo $Combo; Pump 900
  TypeAscii 'zz'; Pump 200; Tap $VK['esc']; Pump 600
  Combo $Combo; Pump 900
  Tap $VK['enter']; Pump 700
  $r.runs_total = (NewLogs 'palette.run' | ForEach-Object { ($_ | ConvertFrom-Json).id }) -join ','
} else { $r.skipped = 'palette not in front' }
$form.Close()
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
