# dev 앱을 띄우고 시험 스크립트를 돌린 뒤 모두 정리한다. 사용: .\run-smoke.ps1 -Script t11-smoke.ps1
# 결과와 dev 로그는 %TEMP%\sure-mate-smoke, 앱 로그는 %APPDATA%\Sure-Mate\logs 에 남는다.
param([string]$Script = 't5-smoke.ps1')
$W = $PSScriptRoot
$desktop = (Resolve-Path "$PSScriptRoot\..\..").Path
$work = Join-Path $env:TEMP 'sure-mate-smoke'; New-Item -ItemType Directory -Force $work | Out-Null
$log = "$work\dev.log"
$p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c set ELECTRON_RUN_AS_NODE=& npm run dev > `"$log`" 2>&1" -WorkingDirectory $desktop -PassThru -WindowStyle Hidden
$appLog = Join-Path $env:APPDATA ("Sure-Mate\logs\" + (Get-Date -Format 'yyyy-MM-dd') + ".log")
$before = if (Test-Path $appLog) { @(Get-Content $appLog).Count } else { 0 }
$deadline = (Get-Date).AddSeconds(90); $readyLine = $null
while ((Get-Date) -lt $deadline -and -not $readyLine) { Start-Sleep -Milliseconds 500; if (Test-Path $appLog) { $readyLine = Get-Content $appLog | Select-Object -Skip $before | Where-Object { $_ -match 'app.ready' } | Select-Object -First 1 } }
"ready: $readyLine"
$combo = if ($readyLine) { ($readyLine | ConvertFrom-Json).paletteHotkey } else { $null }
$out = "$work\smoke-out.txt"; Remove-Item $out -ErrorAction SilentlyContinue
if ($combo) {
  Start-Sleep -Seconds 2
  $t = Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$W\$Script`" -Combo `"$combo`"" -RedirectStandardOutput $out -PassThru -WindowStyle Hidden
  if (-not $t.WaitForExit(60000)) { "WATCHDOG: test killed after 60s"; Stop-Process -Id $t.Id -Force }
}
taskkill /PID $p.Id /T /F 2>$null | Out-Null
Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$desktop*" } | Stop-Process -Force
Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'SureMate-Test' } | Stop-Process -Force
"--- results"; Get-Content $out -ErrorAction SilentlyContinue
"--- app log (this run)"; Get-Content $appLog | Select-Object -Skip $before | Select-Object -First 40
