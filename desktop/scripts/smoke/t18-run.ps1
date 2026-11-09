# M5 바 시험: settings.json을 잠시 바꿔(AI 대상 "복사만", 가명 처리 되돌리기, 가장자리 띠·오른쪽·주 모니터, 위치 초기화)
# t18-bar.ps1을 자동 숨김 끔으로 한 번, 켬(-AutoHide)으로 한 번 돌리고 설정을 되돌린다.
# 출력은 파일로 받는다(예: .\t18-run.ps1 > out.txt). 파이프가 일찍 끊기면 finally가 돌지 않아 settings.json이 시험 값으로 남는다.
$W = $PSScriptRoot
$settings = Join-Path $env:APPDATA 'Sure-Mate\settings.json'
$backup = "$settings.smoke-backup"
if (Test-Path $backup) {
  "STOP: $backup 가 이미 있다. 앞선 시험이 도중에 끊긴 흔적이다. settings.json 과 비교해 정리한 뒤 다시 실행한다."
  return
}
$had = Test-Path $settings
if ($had) { Copy-Item $settings $backup -Force }
function WriteSettings([bool]$autoHide) {
  $s = if (Test-Path $settings) { Get-Content $settings -Raw -Encoding utf8 | ConvertFrom-Json } else { New-Object psobject }
  $s | Add-Member -Force -NotePropertyName ai -NotePropertyValue ([pscustomobject]@{ defaultTarget = 'copy'; custom = @() })
  $masking = if ($s.PSObject.Properties['masking']) { $s.masking } else { New-Object psobject }
  $masking | Add-Member -Force -NotePropertyName mode -NotePropertyValue 'restore'
  $s | Add-Member -Force -NotePropertyName masking -NotePropertyValue $masking
  $bar = [pscustomobject]@{
    shape = 'edge'; edge = 'right'; monitor = 'primary'; positions = @()
    pinnedPrompts = @('meeting-notes', 'req-to-testcase', 'static-analysis'); autoHide = $autoHide; opacity = 1
  }
  $s | Add-Member -Force -NotePropertyName bar -NotePropertyValue $bar
  New-Item -ItemType Directory -Force (Split-Path $settings) | Out-Null
  $s | ConvertTo-Json -Depth 8 | Set-Content -Path $settings -Encoding utf8
}
try {
  WriteSettings $false
  "=== run 1: autoHide false"
  & "$W\run-smoke.ps1" -Script t18-bar.ps1 -TimeoutSec 150
  WriteSettings $true
  "=== run 2: autoHide true"
  & "$W\run-smoke.ps1" -Script t18-bar.ps1 -ScriptArgs '-AutoHide' -TimeoutSec 60
} finally {
  if ($had) { Copy-Item $backup $settings -Force } else { Remove-Item $settings -ErrorAction SilentlyContinue }
  Remove-Item $backup -ErrorAction SilentlyContinue
  "--- settings restored"
}
