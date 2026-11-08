# Task 7 smoke: palette "ime"+Enter -> logger window opens; type "ab", Tab, Tab, Space -> JSON saved
param([string]$Combo = 'Alt+`')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$form = NewTestForm
Combo $Combo; Pump 900
if ((IsApp)) {
  TypeAscii 'ime'; Pump 300; Tap $VK['enter']; Pump 2500
  $fg = Fg; $r.logger_fg = "$($fg.Process) / $($fg.Title)"
  if ((IsApp)) {
    TypeAscii 'ab'; Pump 300
    Tap 0x09; Pump 150; Tap 0x09; Pump 150; Tap $VK['space']; Pump 800
    $saved = NewLogs 'dev.imeLog.saved' | Select-Object -Last 1
    $r.saved_log = $saved
    if ($saved) { $path = ($saved | ConvertFrom-Json).path; $j = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json; $r.rows = $j.rows.Count; $r.types = (($j.rows | ForEach-Object { $_.type }) | Select-Object -Unique) -join ',' }
  }
} else { $r.skipped = 'palette not in front' }
$form.Close()
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
