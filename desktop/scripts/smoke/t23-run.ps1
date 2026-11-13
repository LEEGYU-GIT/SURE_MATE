# t23: 설정(AI 대상 "복사만", 팔레트를 주 모니터에, 첫 실행 안내 완료)을 잠시 바꾸고, 워크스페이스(workspaces.json)·기억한 문장(phrase-map.json)·
# 사용 기록(usage.json)·사용자 단어 목록(intents.json)을 백업한 뒤 지워 빈 상태로 t23-apps.ps1을 돌리고 모두 되돌린다(t22-run.ps1과 같은 방법).
# 빈 상태로 시작해야 최근 항목·기억한 문장·사용자 워크스페이스가 맨 위 후보를 바꾸지 않는다(맨 위가 다르면 Enter가 다른 항목을 실행한다).
# workspaces.json.bak(앱이 다시 저장할 때 남기는 이전 파일)도 백업하고 되돌린다. 사내 메신저·Ttree의 파일과 설정은 건드리지 않는다.
# 실행 전에 사내 메신저와 Ttree를 켜 둔다(설치되어 있는데 꺼져 있으면 t23-apps.ps1이 키를 보내기 전에 멈춘다). 시험 중에는 마우스·키보드를 사용하지 않는다.
# 출력은 Select-Object로 자르지 말고 파일로 받아 읽는다(되돌리기 finally가 돌아야 한다, README).
$W = $PSScriptRoot
$dir = Join-Path $env:APPDATA 'Sure-Mate'
$settings = Join-Path $dir 'settings.json'
$cleared = @('workspaces.json', 'phrase-map.json', 'usage.json', 'intents.json') | ForEach-Object { Join-Path $dir $_ }
$files = @($settings) + $cleared + @(Join-Path $dir 'workspaces.json.bak')
# 앞선 시험이 도중에 끊기면 백업 파일이 남는다. 그 위에 새 백업을 덮으면 원래 파일을 잃으므로 멈춘다
foreach ($f in $files) {
  if (Test-Path "$f.smoke-backup") {
    "STOP: $f.smoke-backup 가 이미 있다. 앞선 시험이 도중에 끊긴 흔적이다. 원래 파일과 비교해 정리한 뒤 다시 실행한다."
    return
  }
}
# 시험 중 클립보드는 가짜 글로 바뀐다(확인 화면이 사용자의 클립보드 글을 보이지 않게). 시작 전에 글자였으면 내용을 저장해 두었다가 finally에서 되돌린다
# (내용은 출력하지 않는다). 글자가 아닌 것(파일·그림)이 있었으면 되돌릴 수 없으므로 그 사실만 알린다
Add-Type -AssemblyName System.Windows.Forms
$clipText = $null; $clipState = 'empty'
try {
  if ([System.Windows.Forms.Clipboard]::ContainsText()) { $clipText = [System.Windows.Forms.Clipboard]::GetText(); if ($clipText) { $clipState = 'text' } }
  elseif ([System.Windows.Forms.Clipboard]::GetDataObject().GetFormats().Count -gt 0) { $clipState = 'other' }
} catch { $clipState = 'unreadable' }
$had = @{}; $backed = @{}
foreach ($f in $files) { $had[$f] = Test-Path $f; $backed[$f] = $false }
function WriteSettings {
  $s = if ($had[$settings]) { Get-Content "$settings.smoke-backup" -Raw -Encoding utf8 | ConvertFrom-Json } else { New-Object psobject }
  # 확인 화면에서 Enter를 누르지 않지만, 잘못 눌려도 브라우저를 열지 않고 복사만 하게(t14-run.ps1과 같다)
  $s | Add-Member -Force -NotePropertyName ai -NotePropertyValue ([pscustomobject]@{ defaultTarget = 'copy'; custom = @() })
  # 모니터가 둘이면 팔레트가 마우스가 있는 모니터에 뜬다. 주 모니터에 고정한다(t22-run.ps1과 같다)
  $s | Add-Member -Force -NotePropertyName palette -NotePropertyValue ([pscustomobject]@{ display = 'primary' })
  # 첫 실행 안내 창이 시험 창의 포커스를 가져가지 않게
  $s | Add-Member -Force -NotePropertyName onboardingDone -NotePropertyValue $true
  # 이석 미리 알림 미리 보기(b2)를 펫 말풍선으로 보이게 말랑 메이트를 보이고 말풍선을 켠다(나머지 펫 설정은 그대로)
  $pet = if ($s.pet) { $s.pet } else { New-Object psobject }
  $pet | Add-Member -Force -NotePropertyName visible -NotePropertyValue $true
  $pet | Add-Member -Force -NotePropertyName bubbles -NotePropertyValue $true
  $s | Add-Member -Force -NotePropertyName pet -NotePropertyValue $pet
  New-Item -ItemType Directory -Force $dir | Out-Null
  $s | ConvertTo-Json -Depth 8 | Set-Content -Path $settings -Encoding utf8
}
try {
  # 백업은 try 안에서 만든다(만들다 실패해도 finally가 만든 백업만 되돌린다). 원래 파일은 모든 백업이 끝나기 전에는 지우거나 바꾸지 않는다
  foreach ($f in $files) {
    if ($had[$f]) { Copy-Item $f "$f.smoke-backup" -Force; $backed[$f] = $true }
  }
  foreach ($f in $cleared) {
    if ($had[$f]) { Remove-Item $f -Force }
  }
  WriteSettings
  # 정상 실행은 1분 안팎이고 모든 대기가 시간을 다 쓰면 약 2분이다. 감시 시간이 끝나 시험이 강제로 끝나면 결과 줄을 잃으므로 넉넉히 둔다
  & "$W\run-smoke.ps1" -Script t23-apps.ps1 -TimeoutSec 240 -ScriptArgs '-FromRunner'
} finally {
  foreach ($f in $files) {
    if ($backed[$f]) { Copy-Item "$f.smoke-backup" $f -Force; Remove-Item "$f.smoke-backup" } elseif (-not $had[$f]) { Remove-Item $f -ErrorAction SilentlyContinue }
  }
  "--- settings, workspaces, remembered sentences, usage and intents restored"
  # 클립보드 되돌리기(다른 프로그램이 잡고 있으면 실패하므로 몇 번 다시 시도한다)
  $clipDone = $false
  if ($clipState -eq 'text' -or $clipState -eq 'empty') {
    for ($i = 0; $i -lt 5 -and -not $clipDone; $i++) {
      try { if ($clipState -eq 'text') { [System.Windows.Forms.Clipboard]::SetText($clipText) } else { [System.Windows.Forms.Clipboard]::Clear() }; $clipDone = $true } catch { Start-Sleep -Milliseconds 200 }
    }
  }
  "--- clipboard: " + $(if ($clipDone) { "restored (was $clipState)" } else { "NOT restored (was ${clipState}: only plain text can be restored)" })
}
