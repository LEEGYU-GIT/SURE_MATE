# t21: 설정(AI 대상 "복사만", 바를 주 모니터 오른쪽 가장자리 띠·자동 숨김 끔, 가명 처리 되돌리기, 첫 실행 안내 완료)을 잠시 바꾸고,
# 워크스페이스(workspaces.json)·기억한 문장(phrase-map.json)·사용 기록(usage.json)·사용자 단어 목록(intents.json)을 백업한 뒤 지워 빈 상태로
# t21-workspace.ps1을 돌리고 모두 되돌린다. 빈 상태로 시작해야 시험이 저장한 워크스페이스가 목록과 바 메뉴의 첫 행이 된다.
# 시험은 workspaces.json을 여러 번 저장하므로(저장·이름·단축키) workspaces.json.bak(앱이 다시 저장할 때 남기는 이전 파일)도 백업하고 되돌린다.
# 말랑 메이트 설정은 바꾸지 않는다(펫을 숨겨 두었으면 조종 모드 단계만 skipped).
# -WsHotkey: 시험이 워크스페이스에 녹화할 단축키(기본 Ctrl+Alt+9). 다른 앱이 그 조합을 사용하면 다른 조합으로 다시 실행한다(예: -WsHotkey Ctrl+Alt+8).
# 출력은 Select-Object로 자르지 말고 파일로 받아 읽는다(되돌리기 finally가 돌아야 한다, README).
param([string]$WsHotkey = 'Ctrl+Alt+9')
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
# 시험 중 클립보드는 가짜 글로 바뀐다. 시작 전에 글자였으면 내용을 저장해 두었다가 finally에서 되돌린다(내용은 출력하지 않는다).
# 글자가 아닌 것(파일·그림)이 있었으면 되돌릴 수 없으므로 그 사실만 알린다
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
  $s | Add-Member -Force -NotePropertyName ai -NotePropertyValue ([pscustomobject]@{ defaultTarget = 'copy'; custom = @() })
  $bar = if ($s.bar) { $s.bar } else { New-Object psobject }
  $bar | Add-Member -Force -NotePropertyName shape -NotePropertyValue 'edge'
  $bar | Add-Member -Force -NotePropertyName edge -NotePropertyValue 'right'
  $bar | Add-Member -Force -NotePropertyName monitor -NotePropertyValue 'primary'
  $bar | Add-Member -Force -NotePropertyName autoHide -NotePropertyValue $false
  $bar | Add-Member -Force -NotePropertyName positions -NotePropertyValue @()
  $s | Add-Member -Force -NotePropertyName bar -NotePropertyValue $bar
  $masking = if ($s.masking) { $s.masking } else { New-Object psobject }
  $masking | Add-Member -Force -NotePropertyName mode -NotePropertyValue 'restore'
  $s | Add-Member -Force -NotePropertyName masking -NotePropertyValue $masking
  # 첫 실행 안내 창이 시험 창·설정 창의 포커스를 가져가지 않게
  $s | Add-Member -Force -NotePropertyName onboardingDone -NotePropertyValue $true
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
  # 시험 스크립트는 정상이면 1~2분이고, 모든 대기가 시간을 다 쓰면 약 4분이다(펫이 멈추길 기다리는 최대 25초 포함).
  # 감시 시간이 끝나 시험이 강제로 끝나면 결과 줄을 잃으므로 넉넉히 둔다
  & "$W\run-smoke.ps1" -Script t21-workspace.ps1 -TimeoutSec 600 -ScriptArgs "-WsHotkey $WsHotkey -FromRunner"
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
  "--- clipboard: " + $(if ($clipDone) { "restored (was $clipState)" } else { "NOT restored (was $clipState: only plain text can be restored)" })
}
