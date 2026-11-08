# koffi.node를 잠시 숨기고(회사 보안 프로그램이 막은 상황) t12를 돌린 뒤 되돌린다.
# 설정의 팔레트 단축키도 Ctrl+Alt+Space로 바꿔, 다른 앱이 잡고 있으면 대체 조합이 트레이에 보이는지 함께 본다.
$W = $PSScriptRoot
$desktop = (Resolve-Path "$PSScriptRoot\..\..").Path
$node = Join-Path $desktop 'node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node'
$settings = Join-Path $env:APPDATA 'Sure-Mate\settings.json'
$hadSettings = Test-Path $settings
if ($hadSettings) { Copy-Item $settings "$settings.smoke-backup" -Force }
try {
  Rename-Item $node 'koffi.node.blocked'
  $json = '{ "version": 1, "hotkeys": { "palette": "Ctrl+Alt+Space", "lookup": "Ctrl+Alt+W" }, "palette": { "display": "cursor" }, "launchAtLogin": true, "masking": { "mode": "restore" }, "onboardingDone": false }'
  New-Item -ItemType Directory -Force (Split-Path $settings) | Out-Null
  Set-Content -Path $settings -Value $json -Encoding utf8
  & "$W\run-smoke.ps1" -Script t12-smoke.ps1
} finally {
  if (Test-Path "$node.blocked") { Rename-Item "$node.blocked" 'koffi.node' }
  if ($hadSettings) { Copy-Item "$settings.smoke-backup" $settings -Force; Remove-Item "$settings.smoke-backup" } else { Remove-Item $settings -ErrorAction SilentlyContinue }
  "--- restored: koffi.node exists = $(Test-Path $node)"
}
