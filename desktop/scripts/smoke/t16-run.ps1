# 기본 AI 대상을 잠시 "복사만"으로, 가명 사전을 가상 예시로 바꿔 t16을 돌리고 둘 다 되돌린다.
param([string]$Script = 't16-masking.ps1')
$W = $PSScriptRoot
$dir = Join-Path $env:APPDATA 'Sure-Mate'
$settings = Join-Path $dir 'settings.json'
$dict = Join-Path $dir 'masking-dictionary.json'
$had = @{}
foreach ($f in @($settings, $dict)) {
  $had[$f] = Test-Path $f
  if ($had[$f]) { Copy-Item $f "$f.smoke-backup" -Force }
}
try {
  New-Item -ItemType Directory -Force $dir | Out-Null
  $s = if ($had[$settings]) { Get-Content $settings -Raw -Encoding utf8 | ConvertFrom-Json } else { New-Object psobject }
  $s | Add-Member -Force -NotePropertyName ai -NotePropertyValue ([pscustomobject]@{ defaultTarget = 'copy'; custom = @() })
  $s | ConvertTo-Json -Depth 6 | Set-Content -Path $settings -Encoding utf8
  # 가상 예시만 쓴다(실제 고객사 이름 금지)
  $d = [ordered]@{
    format = 'sure-mate-masking'; version = 1
    terms = @(
      [ordered]@{ id = 'example-client-1'; category = 'client'; canonical = '가상자동차'; aliases = @('가상차') },
      [ordered]@{ id = 'example-client-2'; category = 'client'; canonical = 'XY방산'; aliases = @() }
    )
  }
  $d | ConvertTo-Json -Depth 6 | Set-Content -Path $dict -Encoding utf8
  & "$W\run-smoke.ps1" -Script $Script
} finally {
  foreach ($f in @($settings, $dict)) {
    if ($had[$f]) { Copy-Item "$f.smoke-backup" $f -Force; Remove-Item "$f.smoke-backup" } else { Remove-Item $f -ErrorAction SilentlyContinue }
  }
  "--- settings and dictionary restored"
}
