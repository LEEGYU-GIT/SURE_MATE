# 기본 AI 대상을 잠시 "복사만"으로 바꿔(브라우저가 열리지 않게) t14를 돌리고 설정을 되돌린다.
$W = $PSScriptRoot
$settings = Join-Path $env:APPDATA 'Sure-Mate\settings.json'
$backup = "$settings.smoke-backup"
$had = Test-Path $settings
if ($had) { Copy-Item $settings $backup -Force }
try {
  $s = if ($had) { Get-Content $settings -Raw -Encoding utf8 | ConvertFrom-Json } else { New-Object psobject }
  $s | Add-Member -Force -NotePropertyName ai -NotePropertyValue ([pscustomobject]@{ defaultTarget = 'copy'; custom = @() })
  New-Item -ItemType Directory -Force (Split-Path $settings) | Out-Null
  $s | ConvertTo-Json -Depth 6 | Set-Content -Path $settings -Encoding utf8
  & "$W\run-smoke.ps1" -Script t14-prompt.ps1
} finally {
  if ($had) { Copy-Item $backup $settings -Force; Remove-Item $backup } else { Remove-Item $settings -ErrorAction SilentlyContinue }
  "--- settings restored"
}
