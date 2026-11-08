# Task 5 smoke: test window -> hotkey -> palette -> Esc -> focus back, quick repeats, second instance
param([string]$Combo = 'Ctrl+Alt+Space')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$desktop = (Resolve-Path "$PSScriptRoot\..\..").Path
$toks = $Combo.ToLower().Split('+')
$Mods = @($toks[0..($toks.Count - 2)] | ForEach-Object { VkOf $_ })
$Main = VkOf $toks[-1]
function Hotkey { foreach ($m in $Mods) { Key $m }; Key $Main; Key $Main -Up; foreach ($m in $Mods[($Mods.Count - 1)..0]) { Key $m -Up } }
function LogCount([string]$event) { @(NewLogs $event).Count }
function LastLog([string]$event) { NewLogs $event | Select-Object -Last 1 }

$results = [ordered]@{}
$form = NewTestForm
$results.start_foreground = (Fg).Title

# 1) hotkey -> palette
$show0 = LogCount 'palette.show'
Hotkey; Pump 800
$results.show_after_hotkey = (LogCount 'palette.show') - $show0
$results.palette_bounds = LastLog 'palette.show'
$fg = Fg
$results.foreground_after_show = "$($fg.Process) / $($fg.Title)"

# 2) Esc -> hide + focus back (only if palette is in front)
if ((IsApp)) {
  Tap $VK['esc']; Pump 700
  $results.hide_log = LastLog 'palette.hide'
  $results.foreground_after_esc = (Fg).Title
} else { $results.hide_log = 'SKIPPED: palette not in front, Esc not sent' }

# 3) quick repeats (6 keydowns 40 ms apart) -> one show. Human-timing hold is in t11.
$show1 = LogCount 'palette.show'; $hide1 = LogCount 'palette.hide'
foreach ($m in $Mods) { Key $m }
for ($i = 0; $i -lt 6; $i++) { Key $Main; Pump 40 }
Key $Main -Up; foreach ($m in $Mods[($Mods.Count - 1)..0]) { Key $m -Up }; Pump 600
$results.hold_show_count = (LogCount 'palette.show') - $show1
$results.hold_hide_count = (LogCount 'palette.hide') - $hide1
if ((IsApp)) { Tap $VK['esc']; Pump 500 }

# 4) second instance -> first shows palette, second exits
$show2 = LogCount 'palette.show'
$psi = New-Object System.Diagnostics.ProcessStartInfo (Join-Path $desktop 'node_modules\electron\dist\electron.exe'), '.'
$psi.WorkingDirectory = $desktop; $psi.UseShellExecute = $false
$psi.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$second = [System.Diagnostics.Process]::Start($psi)
$exited = $second.WaitForExit(8000); Pump 600
$results.second_instance_exited = $exited
$results.second_instance_show = (LogCount 'palette.show') - $show2
if ((IsApp)) { Tap $VK['esc']; Pump 400 }

$form.Close()
$results.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
