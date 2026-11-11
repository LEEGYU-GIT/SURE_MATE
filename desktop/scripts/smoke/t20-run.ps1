# t20: AI 대상 "복사만", 가명 사전을 가상 예시로, 바를 주 모니터 오른쪽 가장자리 띠(자동 숨김 끔, 고정 프롬프트 3개)로,
# 펫 설정을 시험 값(보이기·크기 56·보통·말풍선·반응 켬, 조종 단축키 없음, 졸기까지 1분)으로 잠시 바꿔
# t20-pet.ps1을 돌리고 설정과 사전을 되돌린다. -Idle이면 졸기까지 3분(기본값)으로 5분 동안 입력 없이 CPU만 잰다.
# 출력은 Select-Object로 자르지 말고 파일로 받아 읽는다(되돌리기 finally가 돌아야 한다, README).
param([switch]$Idle)
$W = $PSScriptRoot
$dir = Join-Path $env:APPDATA 'Sure-Mate'
$settings = Join-Path $dir 'settings.json'
$dict = Join-Path $dir 'masking-dictionary.json'
$files = @($settings, $dict)
# 앞선 시험이 도중에 끊기면 백업 파일이 남는다. 그 위에 새 백업을 덮으면 원래 설정을 잃으므로 멈춘다
foreach ($f in $files) {
  if (Test-Path "$f.smoke-backup") {
    "STOP: $f.smoke-backup 가 이미 있다. 앞선 시험이 도중에 끊긴 흔적이다. 원래 파일과 비교해 정리한 뒤 다시 실행한다."
    return
  }
}
$had = @{}
foreach ($f in $files) {
  $had[$f] = Test-Path $f
  if ($had[$f]) { Copy-Item $f "$f.smoke-backup" -Force }
}
function WriteSettings([int]$sleepAfterMin) {
  $s = if ($had[$settings]) { Get-Content "$settings.smoke-backup" -Raw -Encoding utf8 | ConvertFrom-Json } else { New-Object psobject }
  $s | Add-Member -Force -NotePropertyName ai -NotePropertyValue ([pscustomobject]@{ defaultTarget = 'copy'; custom = @() })
  $bar = if ($s.bar) { $s.bar } else { New-Object psobject }
  $bar | Add-Member -Force -NotePropertyName shape -NotePropertyValue 'edge'
  $bar | Add-Member -Force -NotePropertyName edge -NotePropertyValue 'right'
  $bar | Add-Member -Force -NotePropertyName monitor -NotePropertyValue 'primary'
  $bar | Add-Member -Force -NotePropertyName autoHide -NotePropertyValue $false
  $bar | Add-Member -Force -NotePropertyName positions -NotePropertyValue @()
  $bar | Add-Member -Force -NotePropertyName pinnedPrompts -NotePropertyValue @('meeting-notes', 'req-to-testcase', 'static-analysis')
  $s | Add-Member -Force -NotePropertyName bar -NotePropertyValue $bar
  $masking = if ($s.masking) { $s.masking } else { New-Object psobject }
  $masking | Add-Member -Force -NotePropertyName mode -NotePropertyValue 'restore'
  $s | Add-Member -Force -NotePropertyName masking -NotePropertyValue $masking
  $pet = [pscustomobject]@{ visible = $true; size = 56; activity = 'normal'; sleepAfterMin = $sleepAfterMin; bubbles = $true; reactions = $true; controlHotkey = $null; reduceMotion = $false }
  $s | Add-Member -Force -NotePropertyName pet -NotePropertyValue $pet
  New-Item -ItemType Directory -Force $dir | Out-Null
  $s | ConvertTo-Json -Depth 8 | Set-Content -Path $settings -Encoding utf8
}
try {
  # 가상 예시만 쓴다(실제 고객사 이름 금지). 회의 메모의 가상자동차·XY방산이 가명으로 바뀌는지 보려고 t16과 같은 사전을 넣는다
  $d = [ordered]@{
    format = 'sure-mate-masking'; version = 1
    terms = @(
      [ordered]@{ id = 'example-client-1'; category = 'client'; canonical = '가상자동차'; aliases = @('가상차') },
      [ordered]@{ id = 'example-client-2'; category = 'client'; canonical = 'XY방산'; aliases = @() }
    )
  }
  New-Item -ItemType Directory -Force $dir | Out-Null
  $d | ConvertTo-Json -Depth 6 | Set-Content -Path $dict -Encoding utf8
  if ($Idle) {
    WriteSettings 3
    & "$W\run-smoke.ps1" -Script t20-pet.ps1 -TimeoutSec 420 -ScriptArgs '-IdleMinutes 5'
  } else {
    WriteSettings 1
    & "$W\run-smoke.ps1" -Script t20-pet.ps1 -TimeoutSec 480
  }
} finally {
  foreach ($f in $files) {
    if ($had[$f]) { Copy-Item "$f.smoke-backup" $f -Force; Remove-Item "$f.smoke-backup" } else { Remove-Item $f -ErrorAction SilentlyContinue }
  }
  "--- settings and dictionary restored"
}
