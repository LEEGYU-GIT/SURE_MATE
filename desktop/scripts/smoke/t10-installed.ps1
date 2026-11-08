# silent per-user install -> launch installed app -> smoke (t9) -> quit -> uninstall -> cleanup
$ErrorActionPreference = 'Continue'
$W = $PSScriptRoot
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$setup = Join-Path (Resolve-Path "$PSScriptRoot\..\..").Path 'dist\Sure-Mate-Setup-0.1.0.exe'
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\Sure-Mate'
$appLog = Join-Path $env:APPDATA ("Sure-Mate\logs\" + (Get-Date -Format 'yyyy-MM-dd') + ".log")
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$work = Join-Path $env:TEMP 'sure-mate-smoke'; New-Item -ItemType Directory -Force $work | Out-Null

"1) install (silent, per-user)"
$sw = [Diagnostics.Stopwatch]::StartNew()
$p = Start-Process $setup -ArgumentList '/S' -PassThru
if (-not $p.WaitForExit(180000)) { "   installer did not finish in 180s (UAC prompt?)"; Stop-Process -Id $p.Id -Force; exit 1 }
"   exit=$($p.ExitCode) in $([int]$sw.Elapsed.TotalSeconds)s"
"   exe exists: " + (Test-Path "$installDir\Sure-Mate.exe")
"   start menu shortcut: " + (Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Sure-Mate.lnk")

"2) launch installed app"
Get-Process Sure-Mate -ErrorAction SilentlyContinue | Stop-Process -Force
$before = if (Test-Path $appLog) { @(Get-Content $appLog).Count } else { 0 }
$app = Start-Process "$installDir\Sure-Mate.exe" -PassThru
$deadline = (Get-Date).AddSeconds(40); $ready = $null
while ((Get-Date) -lt $deadline -and -not $ready) { Start-Sleep -Milliseconds 400; $ready = Get-Content $appLog -ErrorAction SilentlyContinue | Select-Object -Skip $before | Where-Object { $_ -match 'app.ready' } | Select-Object -First 1 }
"   ready: $ready"
"   login item: " + ((Get-ItemProperty $runKey -ErrorAction SilentlyContinue).PSObject.Properties | Where-Object { $_.Value -like '*Sure-Mate*' } | ForEach-Object { "$($_.Name) = $($_.Value)" })

"3) smoke on installed app"
if ($ready) {
  $combo = ($ready | ConvertFrom-Json).paletteHotkey
  $out = "$work\installed-smoke-out.txt"
  $t = Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$W\t9-smoke.ps1`" -Combo `"$combo`"" -RedirectStandardOutput $out -PassThru -WindowStyle Hidden
  if (-not $t.WaitForExit(60000)) { "   WATCHDOG: smoke killed"; Stop-Process -Id $t.Id -Force }
  Get-Content $out | Where-Object { $_ -notmatch '^True$' } | ForEach-Object { "   $_" }
}

"4) quit + uninstall"
Get-Process Sure-Mate -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
$un = Join-Path $installDir 'Uninstall Sure-Mate.exe'
if (Test-Path $un) { $u = Start-Process $un -ArgumentList '/S' -PassThru; [void]$u.WaitForExit(120000); "   uninstall exit=$($u.ExitCode)" } else { "   uninstaller not found" }
# NSIS 삭제는 백그라운드로 끝나므로 파일·바로 가기가 사라질 때까지 기다린다
$d = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $d -and ((Test-Path "$installDir\Sure-Mate.exe") -or (Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Sure-Mate.lnk"))) { Start-Sleep -Milliseconds 500 }
"   install dir removed: " + (-not (Test-Path "$installDir\Sure-Mate.exe"))
"   shortcut removed: " + (-not (Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Sure-Mate.lnk"))

"5) cleanup login item left by the test run"
(Get-ItemProperty $runKey -ErrorAction SilentlyContinue).PSObject.Properties | Where-Object { $_.Value -like '*Sure-Mate*' } | ForEach-Object {
  Remove-ItemProperty -Path $runKey -Name $_.Name -ErrorAction SilentlyContinue; "   removed Run entry: $($_.Name)"
}
$approved = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
(Get-ItemProperty $approved -ErrorAction SilentlyContinue).PSObject.Properties | Where-Object { $_.Name -like '*suremate*' -or $_.Name -like '*Sure-Mate*' } | ForEach-Object {
  Remove-ItemProperty -Path $approved -Name $_.Name -ErrorAction SilentlyContinue; "   removed StartupApproved entry: $($_.Name)"
}
