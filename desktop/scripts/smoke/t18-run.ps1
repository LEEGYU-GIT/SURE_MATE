# t18: AI 대상 "복사만", 바를 주 모니터 오른쪽 가장자리 띠(자동 숨김 끔, 기본 위치·고정 프롬프트, 가명 후 되돌리기)로 잠시 바꿔
# t18-bar.ps1을 돌리고, 자동 숨김을 켜 한 번 더(-AutoHide) 돌린 뒤 설정을 되돌린다.
# 출력은 Select-Object로 자르지 말고 파일로 받아 읽는다(되돌리기 finally가 돌아야 한다, README).
$W = $PSScriptRoot
$settings = Join-Path $env:APPDATA 'Sure-Mate\settings.json'
$backup = "$settings.smoke-backup"
$had = Test-Path $settings
# 앞선 시험이 도중에 끊기면 백업 파일이 남는다. 그 위에 새 백업을 덮으면 원래 설정을 잃으므로 멈춘다
if (Test-Path $backup) {
  "STOP: $backup 가 이미 있다. 앞선 시험이 도중에 끊긴 흔적이다. settings.json 과 비교해 정리한 뒤 다시 실행한다."
  return
}
if ($had) { Copy-Item $settings $backup -Force }
function WriteSettings([bool]$autoHide) {
  $s = if ($had) { Get-Content $backup -Raw -Encoding utf8 | ConvertFrom-Json } else { New-Object psobject }
  $s | Add-Member -Force -NotePropertyName ai -NotePropertyValue ([pscustomobject]@{ defaultTarget = 'copy'; custom = @() })
  $bar = if ($s.bar) { $s.bar } else { New-Object psobject }
  $bar | Add-Member -Force -NotePropertyName shape -NotePropertyValue 'edge'
  $bar | Add-Member -Force -NotePropertyName edge -NotePropertyValue 'right'
  $bar | Add-Member -Force -NotePropertyName monitor -NotePropertyValue 'primary'
  $bar | Add-Member -Force -NotePropertyName autoHide -NotePropertyValue $autoHide
  $bar | Add-Member -Force -NotePropertyName positions -NotePropertyValue @()
  $bar | Add-Member -Force -NotePropertyName pinnedPrompts -NotePropertyValue @('meeting-notes', 'req-to-testcase', 'static-analysis')
  $s | Add-Member -Force -NotePropertyName bar -NotePropertyValue $bar
  $masking = if ($s.masking) { $s.masking } else { New-Object psobject }
  $masking | Add-Member -Force -NotePropertyName mode -NotePropertyValue 'restore'
  $s | Add-Member -Force -NotePropertyName masking -NotePropertyValue $masking
  # 팔레트를 주 모니터에 고정한다(기본은 마우스가 있는 모니터라 모니터가 둘이면 시험이 다른 모니터의 팔레트를 놓친다)
  $s | Add-Member -Force -NotePropertyName palette -NotePropertyValue ([pscustomobject]@{ display = 'primary' })
  New-Item -ItemType Directory -Force (Split-Path $settings) | Out-Null
  $s | ConvertTo-Json -Depth 8 | Set-Content -Path $settings -Encoding utf8
}
try {
  WriteSettings $false
  & "$W\run-smoke.ps1" -Script t18-bar.ps1 -TimeoutSec 180
  WriteSettings $true
  & "$W\run-smoke.ps1" -Script t18-bar.ps1 -TimeoutSec 60 -ScriptArgs '-AutoHide'
} finally {
  if ($had) { Copy-Item $backup $settings -Force; Remove-Item $backup } else { Remove-Item $settings -ErrorAction SilentlyContinue }
  "--- settings restored"
}
