# M7 워크스페이스(설계 §11 완료 기준, 설정 창의 워크스페이스 탭). t21-run.ps1로 실행한다(설정을 잠시 바꾸고, 워크스페이스·기억한 문장·사용 기록·
# 사용자 단어 목록을 비운 채 시작해 끝나면 되돌림). 판정 줄은 README "t21 결과를 눈으로 확인할 곳".
# 시험 창 SureMate-WS-A·B·C(주 모니터 작업 영역 기준 (100,100)·(750,100) 600x400 물리 픽셀, C는 최대화)를 팔레트 `@` → "지금 배치 저장"으로 저장하고,
# 저장 뒤 열리는 설정 창에서 이름을 'smoke ws'로 바꾼 다음, 흐트러뜨리고 팔레트·워크스페이스 단축키·바 메뉴로 불러온다.
# 배율이 다른 두 번째 모니터가 있으면 B를 그 모니터에 둔다(없으면 mixed_dpi는 skipped).
# 좌표는 물리 픽셀이다: DpiAware로 이 스레드를 모니터별 DPI 인식 v2로 바꾼 뒤 창 테두리는 FrameOf, 모니터는 ScreensInfo로 읽는다. 앱 로그의 DIP는 배율을 곱한다.
# 글자는 TypeUnicode로, Enter·Esc·Tab·보조키 조합은 스캔 코드와 사람 타이밍(0.09~0.12초 누름, 보조키 0.3초 늦게 뗌)으로 보낸다.
# 클릭은 바 워크스페이스 단추·펼침 창 메뉴 첫 행·말랑 메이트 몸(조종 모드 단계)에만 한다.
# 로그 읽기: palette.show, palette.run(id), workspace.save(op·source·ok·id·windows), settings.window(route·reused·tab), settings.window.closed,
# workspace.edit(id·ok), workspace.restore(source·ok·id·total·placed·missing·maxDiff·ms·restoredFocus), hotkey.change(id·ok·acc·reason),
# pet.control(phase·reason), flyout.show(kind·bounds), bar.place. 설정 창의 이름 칸 선택·Tab 위치처럼 앱이 로그로 알리지 않는 화면 상태는
# workspaces.json(이름·단축키)과 캡처 m7-ws-editor로 확인한다.
# 단계가 예외로 멈추면 그 단계만 `error_단계` 줄을 남기고 다음 단계로 간다. 앞 단계가 성립하지 않은 판정은 True 대신 `skipped (까닭)`을 출력한다.
# -WsHotkey: 워크스페이스에 녹화할 단축키(기본 Ctrl+Alt+9, 다른 앱이 쓰면 t21-run.ps1 -WsHotkey로 바꾼다)
param([string]$Combo = 'Alt+`', [string]$WsHotkey = 'Ctrl+Alt+9', [switch]$FromRunner)
# t21-run.ps1만 -FromRunner를 넘긴다. 직접 실행하면 사용자 설정·워크스페이스 파일을 비우지 않은 채 시작해 결과가 틀리므로 멈춘다
if (-not $FromRunner) { 'error = t21-run.ps1로 실행한다(직접 실행하면 설정과 사용자 파일이 시험 상태가 아니다)'; return }
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$appDir = Join-Path $env:APPDATA 'Sure-Mate'
$wsFile = Join-Path $appDir 'workspaces.json'
$settingsPath = Join-Path $appDir 'settings.json'
# 시험 창 제목(가상)과 설정 창에서 바꿀 이름. 둘 다 앱 로그에 없어야 한다
$titles = [ordered]@{ A = 'SureMate-WS-A'; B = 'SureMate-WS-B'; C = 'SureMate-WS-C' }
$wsName = 'smoke ws'
# 이름·제목·문장을 담는 키. 값이 글자·배열일 때만 걸린다(workspace.edit의 "aliases":0, 펼침 창 이름표의 "kind":"label",
# hotkey.change의 "acc":"Ctrl+Alt+9", settings.window의 "tab":"workspace", settings.update의 "fields":[...] 같은 정상 줄은 걸리지 않는다)
$typedKeyPattern = '"(text|query|sentence|phrase|input|title|name|label|words|aliases|savedTitle|titleIncludes)"\s*:\s*["\[]'
$script:paletteHwnd = [IntPtr]::Zero
$script:why = ''
# 말랑 메이트 크기(펫 자리 어림용, 설정에 없으면 기본 56)
$size = 56
try { $petCfg = (Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json).pet; if ($petCfg -and $petCfg.size) { $size = [int]$petCfg.size } } catch { }

function RectText($x) { if ($x) { return ('{0},{1} {2}x{3}' -f $x.x, $x.y, $x.width, $x.height) }; return 'none' }
function RunText($run) { if ($run) { return [string]$run.id }; return 'none' }
# 아직 출력하지 않은 판정 줄을 skipped(까닭)로 채운다(앞 단계가 성립하지 않아 판정하지 않음)
function SkipAll([string[]]$keys, [string]$reason) { foreach ($k in $keys) { if (-not $r.Contains($k)) { $r[$k] = "skipped ($reason)" } } }
# 시험 창을 앞으로(ControlBox를 끈 창에 Alt 누름·뗌을 보내 SetForegroundWindow를 허용받는다). 앞에 왔으면 $true
function FocusWin($f) {
  Key 0x12; [void][W]::SetForegroundWindow($f.Handle); Key 0x12 -Up; $f.Activate(); Pump 300
  return ((Fg).Title -eq $f.Text)
}
function PaletteFront { return ($script:paletteHwnd -ne [IntPtr]::Zero -and [W]::GetForegroundWindow() -eq $script:paletteHwnd) }
# 팔레트가 앞에 있으면 Esc로 닫는다(확인 화면·위키 화면 → 목록 → 닫힘까지 세 번). 설정 창에는 보내지 않는다
function ClosePalette { for ($i = 0; $i -lt 3 -and (PaletteFront); $i++) { TapHuman 0x1B; Pump 700 } }
# 시험 창을 앞에 두고 팔레트를 열어 글을 친다. 팔레트가 앞에 있을 때만 치고 $true. 아니면 $false이고 까닭은 $script:why(그 단계 판정은 skipped)
function Ask([string]$text, $f) {
  ClosePalette
  if (-not (FocusWin $f)) { $script:why = "the test window $($f.Text) did not come to the front"; return $false }
  $show = PaletteOpen $Combo
  if (-not $show) { $script:why = 'the palette did not open (no palette.show within 3 s)'; return $false }
  if (-not (IsApp)) { $script:why = 'the palette is not the foreground window'; return $false }
  $script:paletteHwnd = [W]::GetForegroundWindow()
  TypeUnicode $text
  Pump 900
  if (-not (PaletteFront)) { $script:why = 'the palette lost the foreground while typing'; return $false }
  return $true
}
function PressEnter { Key 0x0D; Pump 120; Key 0x0D -Up }
# 앞 창이 설정 창이면 그 HWND, 아니면 Zero. 설정 창 = 앱 프로세스의 창이고, 팔레트·펫 창(320x240 DIP)이 아니며 600x400 물리 픽셀 이상
# (설정 창 최소 크기 720x520 DIP. 다른 모니터 구성 질문 같은 앱 대화상자는 작아서 걸러진다)
function SettingsFront {
  $h = [W]::GetForegroundWindow()
  if ($h -eq [IntPtr]::Zero -or $h -eq $script:paletteHwnd) { return [IntPtr]::Zero }
  $fgPid = [int][W]::Pid($h)
  if (@(AppProcs | Where-Object { $_.Id -eq $fgPid }).Count -eq 0) { return [IntPtr]::Zero }
  if (ForegroundIsPetWindow $scale) { return [IntPtr]::Zero }
  $rc = New-Object 'W+RECT'
  if (-not [W]::GetWindowRect($h, [ref]$rc)) { return [IntPtr]::Zero }
  if (($rc.Right - $rc.Left) -lt 600 -or ($rc.Bottom - $rc.Top) -lt 400) { return [IntPtr]::Zero }
  return $h
}
function WaitSettingsFront([int]$timeoutMs) {
  $until = (Get-Date).AddMilliseconds($timeoutMs)
  do { $h = SettingsFront; if ($h -ne [IntPtr]::Zero) { return $h }; Pump 100 } while ((Get-Date) -lt $until)
  return [IntPtr]::Zero
}
# 설정 창을 사람처럼 닫는다: Esc(남아 있는 단축키 녹화 칸을 그만둔다. Alt+F4가 단축키로 녹화되지 않게. 녹화 칸이 없으면 아무 일도 하지 않는다) →
# Alt+F4(Alt 0.3초 늦게 뗌) → settings.window.closed. 돌려주는 값: 'closed' · 'not-front'(앞에 없어 보내지 않음) · 'not-closed'
function CloseSettings {
  if ((SettingsFront) -eq [IntPtr]::Zero) { $script:why = 'the settings window is not in front'; return 'not-front' }
  TapHuman 0x1B; Pump 300
  if ((SettingsFront) -eq [IntPtr]::Zero) { $script:why = 'the settings window lost the foreground after Esc'; return 'not-front' }
  $m = LogMark
  HoldCombo 'alt+f4' 300
  $closed = WaitLog $m 'settings.window.closed' { $true } 3000
  Pump 300
  if ($closed) { return 'closed' }
  $script:why = 'no settings.window.closed within 3 s after Alt+F4'
  return 'not-closed'
}
# workspaces.json(앱이 이름을 바꿔 저장하는 도중이면 한 번 더 읽는다)
function ReadWs {
  for ($i = 0; $i -lt 3; $i++) {
    try { if (Test-Path $wsFile) { return (Get-Content $wsFile -Raw -Encoding UTF8 | ConvertFrom-Json) }; return $null } catch { Pump 150 }
  }
  return $null
}
function WsById($doc, [string]$id) {
  if (-not $doc -or -not $doc.workspaces) { return $null }
  foreach ($w in @($doc.workspaces)) { if ($w.id -eq $id) { return $w } }
  return $null
}
# 워크스페이스의 창 규칙(배치는 모니터 구성 지문을 키로 하나)
function RulesOf($ws) {
  if (-not $ws -or -not $ws.layouts) { return @() }
  $out = @()
  foreach ($p in $ws.layouts.PSObject.Properties) { $out += @($p.Value.windows) }
  return $out
}
# 조건이 맞을 때까지 workspaces.json을 다시 읽는다. 시간 안에 맞지 않으면 마지막으로 읽은 워크스페이스(없으면 $null)
function WaitWs([string]$id, [scriptblock]$ok, [int]$timeoutMs) {
  $until = (Get-Date).AddMilliseconds($timeoutMs)
  $last = $null
  do {
    $last = WsById (ReadWs) $id
    if ($last -and (& $ok $last)) { return $last }
    Pump 150
  } while ((Get-Date) -lt $until)
  return $last
}
# 시험 창 3개 가운데 저장한 제목(savedTitle)의 규칙이 하나씩 있는 창 수. -WithTitleRule이면 제목 규칙(titleIncludes)도 창 제목과 같은 것만 센다
function TestRuleCount($rules, [switch]$WithTitleRule) {
  $n = 0
  foreach ($want in $titles.Values) {
    $m = @($rules | Where-Object { $_.savedTitle -eq $want })
    if ($m.Count -ne 1) { continue }
    if ($WithTitleRule -and $m[0].match.titleIncludes -cne $want) { continue }
    $n++
  }
  return $n
}
# 창 사각형(보이지 않는 크기 조절 테두리 포함, 물리 픽셀). MoveForm과 같은 기준
function WindowRectOf($f) {
  $rc = New-Object 'W+RECT'
  if (-not [W]::GetWindowRect($f.Handle, [ref]$rc)) { throw "GetWindowRect 실패: $($f.Text)" }
  [pscustomobject]@{ x = $rc.Left; y = $rc.Top; width = $rc.Right - $rc.Left; height = $rc.Bottom - $rc.Top }
}
function Nudge($f, [int]$dx, [int]$dy) { $w = WindowRectOf $f; MoveForm $f ($w.x + $dx) ($w.y + $dy) $w.width $w.height }
# 창 상태를 창 스타일로 읽는다(WS_MINIMIZE 0x20000000, WS_MAXIMIZE 0x01000000). 앱이 바꾼 상태도 바로 보인다
function StateOf($f) {
  Pump 100
  $style = [W]::GetWindowLong($f.Handle, -16)
  if (($style -band 0x20000000) -ne 0) { return 'Minimized' }
  if (($style -band 0x01000000) -ne 0) { return 'Maximized' }
  return 'Normal'
}
# 보이는 테두리 두 개의 차이(물리 픽셀). 하나라도 없으면 $null. 함수 이름을 Diff로 하면 Windows PowerShell 기본 별칭 diff(Compare-Object)가 먼저 불려 값이 $null이 된다
function PxDiff($now, $was) {
  if (-not $now -or -not $was) { return $null }
  $dx = [int]$now.x - [int]$was.x; $dy = [int]$now.y - [int]$was.y
  $dw = [int]$now.width - [int]$was.width; $dh = [int]$now.height - [int]$was.height
  $biggest = [Math]::Max([Math]::Max([Math]::Abs($dx), [Math]::Abs($dy)), [Math]::Max([Math]::Abs($dw), [Math]::Abs($dh)))
  [pscustomobject]@{ dx = $dx; dy = $dy; dw = $dw; dh = $dh; max = $biggest }
}
function DiffText($d) { if ($d) { return ('dx={0} dy={1} dw={2} dh={3}' -f $d.dx, $d.dy, $d.dw, $d.dh) }; return 'frame not readable' }
# 설계 §11 완료 기준: 저장 위치에서 ±10px(위치·크기 모두)
# 값이 없거나 숫자가 아니면 False다(Windows PowerShell에서 $null -le 10은 True이므로 숫자 여부를 먼저 확인한다)
function HasMax($d) { return ($null -ne $d -and ($d.max -is [int] -or $d.max -is [double])) }
function WithinTen($d) { return ((HasMax $d) -and $d.max -le 10) }
# 저장 위치에서 50px 이상 벗어났는지(옮기는 단계가 먹혔는지). 값이 없으면 False라 그 판정은 skipped
function MovedAway($d) { return ((HasMax $d) -and $d.max -ge 50) }
function WaitRestore([int]$from, [string]$source) { WaitLog $from 'workspace.restore' { $_.source -eq $source } 15000 }
function RestoreText($x) {
  if (-not $x) { return 'no workspace.restore within 15 s' }
  'ok={0} reason={1} total={2} placed={3} missing={4} elevated={5} off={6} failed={7} maxDiff={8} ms={9} restoredFocus={10}' -f $x.ok, $x.reason, $x.total, $x.placed, $x.missing, $x.elevated, $x.off, $x.failed, $x.maxDiff, $x.ms, $x.restoredFocus
}
# from 줄 뒤의 로그를 줄 순서(idx)와 함께 읽는다(같은 프로세스가 한 줄씩 차례로 쓰므로 줄 순서가 기록 순서다)
function IndexedLogs([int]$from) {
  $lines = @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $from)
  $out = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    try { $out += [pscustomobject]@{ idx = $i; ev = ($lines[$i] | ConvertFrom-Json) } } catch { }
  }
  return $out
}
function FirstOf($list, [scriptblock]$test) {
  foreach ($x in @($list)) { if (& $test $x.ev) { return $x } }
  return $null
}
# 커서를 바·펼침 창에서 치워 둘 곳(주 모니터 작업 영역 왼쪽 40%, 가운데 높이)
function Away { MoveTo ([int]($wa.x + $wa.width * 0.4)) ([int]($wa.y + $wa.height * 0.5)) }
# 펫 몸 상자(둘레 8 DIP 포함)가 그 자리(DIP)를 덮는지. 펫이 보이지 않거나 자리를 알 수 없으면 $false
function PetCovers([double]$xDip, [double]$yDip) {
  $n = PetNow $scale $size
  if (-not $n -or -not $n.box) { return $false }
  $box = $n.box
  return ($xDip -ge $box.x - 8 -and $xDip -le $box.x + $box.width + 8 -and $yDip -ge $box.y - 8 -and $yDip -le $box.y + $box.height + 8)
}
# 누를 자리에서 펫이 비킬 때까지 기다린다(펫 몸을 누르면 펫이 클릭을 받는다). 시간 안에 비키지 않으면 $false(그 판정은 skipped)
function WaitPetAway([double]$xDip, [double]$yDip, [int]$timeoutMs = 6000) {
  $until = (Get-Date).AddMilliseconds($timeoutMs)
  while (PetCovers $xDip $yDip) {
    if ((Get-Date) -ge $until) { return $false }
    Pump 250
  }
  return $true
}
# 조종 모드(t20과 같은 방법): 펫이 멈추길 기다려 몸 가운데를 오른쪽 클릭 → 메뉴 첫 행 "조종하기" → pet.control start
function PetClick($c, [switch]$Right) {
  $px = [int][Math]::Round($c.x * $scale); $py = [int][Math]::Round($c.y * $scale)
  HoverAt $px $py; Pump 250
  if ($Right) { ClickAt $px $py -Right } else { ClickAt $px $py }
}
# 메뉴 자리(DIP)를 5x5 격자로 읽은 색(물리 픽셀). 메뉴가 열리면 대부분의 점이 바뀐다
function MenuPixels($rect) {
  Add-Type -AssemblyName System.Drawing
  $x0 = [int][Math]::Round($rect.x * $scale); $y0 = [int][Math]::Round($rect.y * $scale)
  $w = [int][Math]::Round($rect.width * $scale); $h = [int][Math]::Round($rect.height * $scale)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x0, $y0, 0, 0, (New-Object System.Drawing.Size $w, $h))
  $out = @()
  foreach ($fy in 1..5) { foreach ($fx in 1..5) { $out += $bmp.GetPixel([int]($w * $fx / 6), [int]($h * $fy / 6)).ToArgb() } }
  $g.Dispose(); $bmp.Dispose()
  return $out
}
function OpenPetMenu {
  $now = WaitPetStill $scale 500 25000 $size
  if (-not $now) { return $null }
  $rect = PetMenuRect $now.box $now.window $boundsDip
  # 앱은 펫 메뉴를 열 때 로그를 남기지 않는다(pet.menu는 행을 고른 뒤에만 남는다). 그래서 메뉴 자리 화면이 바뀌었는지로 열렸음을 확인한다
  $before = MenuPixels $rect
  PetClick (PetCenter $now) -Right
  Pump 350
  $after = MenuPixels $rect
  $changed = 0
  for ($i = 0; $i -lt $before.Count; $i++) { if ($before[$i] -ne $after[$i]) { $changed++ } }
  if ($changed -lt 8) { return $null }
  return $rect
}
function PetMenuRow($menu, [int]$row) {
  $p = PetMenuRowPoint $menu $row
  ClickAt ([int][Math]::Round($p.x * $scale)) ([int][Math]::Round($p.y * $scale))
}
function StartControl {
  $m = LogMark
  $menu = OpenPetMenu
  if (-not $menu) { return $false }
  PetMenuRow $menu 0
  return ($null -ne (WaitLog $m 'pet.control' { $_.phase -eq 'start' } 2500))
}
function EndControlIfAny {
  $m = LogMark
  TapHuman 0x1B
  [void](WaitLog $m 'pet.control' { $_.phase -eq 'end' } 1500)
  Pump 300
}

$A = $null; $B = $null; $C = $null
try {
  # 0. t21-run.ps1이 비운 상태인지(직접 실행하면 사용자 파일을 바꾸고, 저장해 둔 워크스페이스·최근 항목이 목록 순서와 메뉴 행을 바꾼다).
  #    앱은 시작할 때 기본 워크스페이스 '화면 감추기'(id builtin-hide)를 만들므로 workspaces.json에 그것만 있으면 빈 상태다
  $left = @(@('phrase-map.json', 'usage.json', 'intents.json') | Where-Object { Test-Path (Join-Path $appDir $_) })
  $builtinAtStart = $false
  if (Test-Path $wsFile) {
    $wsNow = @(); try { $wsNow = @((ReadWs).workspaces) } catch { $wsNow = @('unreadable') }
    if (@($wsNow | Where-Object { $_.id -ne 'builtin-hide' }).Count -gt 0) { $left += 'workspaces.json (a workspace other than the built-in one)' }
    $builtinAtStart = (@($wsNow | Where-Object { $_.id -eq 'builtin-hide' }).Count -eq 1)
  }
  if ($left.Count -gt 0) { throw "t21-run.ps1로 실행한다(시작할 때 없어야 하는 파일이 있다: $($left -join ', '))" }
  $r.builtin_created = $builtinAtStart
  $r.info_palette_hotkey = $Combo
  $r.info_workspace_hotkey = $WsHotkey
  $r.info_dpi_awareness = DpiAware
  $screens = @(ScreensInfo)
  if ($screens.Count -eq 0) { throw 'ScreensInfo가 모니터를 읽지 못했다' }
  $primary = $screens[0]
  $scale = [double]$primary.scale
  $wa = $primary.work
  $boundsDip = [pscustomobject]@{ x = $primary.bounds.x / $scale; y = $primary.bounds.y / $scale; width = $primary.bounds.width / $scale; height = $primary.bounds.height / $scale }
  $r.monitors = $screens.Count
  $r.info_monitors = (@($screens | ForEach-Object { '{0}x{1} {2}%{3}' -f $_.bounds.width, $_.bounds.height, [int][Math]::Round($_.scale * 100), $(if ($_.primary) { ' primary' } else { '' }) }) -join '; ')
  # 배율이 주 모니터와 다른 두 번째 모니터(있으면 B를 둔다)
  $other = @($screens | Where-Object { -not $_.primary -and [Math]::Abs([double]$_.scale - $scale) -ge 0.01 }) | Select-Object -First 1
  Away; Pump 300

  # 1. 시험 창: A(100,100)·B(750,100) 600x400은 보통 상태, C는 최대화. 배율이 다른 두 번째 모니터가 있으면 B는 그 모니터 작업 영역 왼쪽 위 + 100
  $A = NewWinForm $titles.A ($wa.x + 100) ($wa.y + 100) 600 400
  if ($other) { $B = NewWinForm $titles.B ($other.work.x + 100) ($other.work.y + 100) 600 400 }
  else { $B = NewWinForm $titles.B ([Math]::Max($wa.x + 100, [Math]::Min($wa.x + 750, $wa.x + $wa.width - 620))) ($wa.y + 100) 600 400 }
  $C = NewWinForm $titles.C ($wa.x + 160) ($wa.y + 140) 640 420
  SetFormState $C 'Maximized'
  Pump 500
  $saved = @{ A = FrameOf $A; B = FrameOf $B }
  if (-not $saved.A -or -not $saved.B) { throw 'FrameOf가 시험 창의 보이는 테두리를 읽지 못했다(DWMWA_EXTENDED_FRAME_BOUNDS)' }
  $cMaxAtSave = ((StateOf $C) -eq 'Maximized')
  $r.info_b_monitor = if ($other) { 'B on {0} at {1}% (primary {2}%)' -f $other.device, [int][Math]::Round($other.scale * 100), [int][Math]::Round($scale * 100) } else { 'B on the primary monitor (no second monitor with a different scale)' }
  $r.info_saved_frames = 'A {0} / B {1} / C maximized={2}' -f (RectText $saved.A), (RectText $saved.B), $cMaxAtSave

  # 2. 팔레트 `@` → 맨 위 "지금 배치 저장" Enter → workspace.save(출처 palette, 성공, 창 3개 이상, 시험 창 3개가 파일에) → 기본 이름 '배치 N' →
  #    설정 창 워크스페이스 탭이 앞에 열리고 새 워크스페이스의 이름 칸 전체가 선택됨 → 'smoke ws' 입력 + Enter(칸을 그 자리에서 저장) →
  #    workspace.edit 성공, workspaces.json 이름이 'smoke ws' → 시험 창 3개의 제목 규칙 → Esc·Alt+F4로 설정 창 닫기
  $step2 = @('workspace_saved', 'default_name_batch_n', 'editor_opened', 'name_committed', 'title_rules_written', 'editor_closed')
  $wsId = $null; $savedOk = $false; $defaultName = $null; $curName = $null
  try {
    if (Ask '@' $A) {
      $mark = LogMark
      PressEnter
      $run = WaitLog $mark 'palette.run' { $true } 3000
      $save = WaitLog $mark 'workspace.save' { $_.source -eq 'palette' } 6000
      $r.info_save_run = 'ran=' + (RunText $run)
      if ($save -and $save.ok -eq $true) {
        $wsId = [string]$save.id
        $ws = WaitWs $wsId { param($w) $true } 2000
        $have = TestRuleCount (RulesOf $ws)
        $savedOk = ([int]$save.windows -ge 3 -and $have -eq 3)
        # 열린 창이 40개를 넘으면 앱이 40개까지만 저장하므로(overLimit) 시험 창이 빠졌을 수 있다: False가 아니라 skipped
        $r.workspace_saved = if ($savedOk) { $true } elseif ([int]$save.overLimit -gt 0) { 'skipped (more than 40 windows open)' } else { $false }
        $r.info_save = 'op={0} windows={1} minimized={2} excluded={3} offscreen={4} overLimit={5} monitors={6} test_windows_in_file={7}/3' -f $save.op, $save.windows, $save.minimized, $save.excluded, $save.offscreen, $save.overLimit, $save.monitors, $have
        if ($ws) {
          $defaultName = [string]$ws.name
          $curName = $defaultName
          $r.default_name_batch_n = ($defaultName -match '^배치 \d+$')
          $r.info_default_name = $defaultName
        }
        SkipAll @('default_name_batch_n') 'workspaces.json has no workspace with the saved id'
        $opened = WaitLog $mark 'settings.window' { $_.tab -eq 'workspace' } 5000
        $front = WaitSettingsFront 5000
        $r.editor_opened = ($null -ne $opened -and $front -ne [IntPtr]::Zero)
        $r.info_editor_opened = 'settings.window={0} reused={1} in_front={2} foreground={3}' -f ($null -ne $opened), $(if ($opened) { $opened.reused } else { '' }), ($front -ne [IntPtr]::Zero), (Fg).Title
        if ($front -ne [IntPtr]::Zero) {
          # 설정 창이 화면을 읽고 그 워크스페이스를 열어 이름 칸을 선택할 때까지 기다린다(개발 모드는 창을 처음 읽을 때 느리다)
          Pump 2000
          if ((SettingsFront) -ne [IntPtr]::Zero) {
            $mark2 = LogMark
            TypeUnicode $wsName
            Pump 300
            PressEnter
            $edit = WaitLog $mark2 'workspace.edit' { $_.id -eq $wsId } 5000
            $ws2 = WaitWs $wsId { param($w) $w.name -ceq $wsName } 3000
            $fileName = if ($ws2) { [string]$ws2.name } else { '' }
            # 선택된 기본 이름을 친 글이 바꿨으면 파일 이름이 친 글과 같다(선택이 없었으면 '배치 1smoke ws'처럼 이어 붙는다)
            $r.name_committed = ($null -ne $edit -and $edit.ok -eq $true -and $fileName -ceq $wsName)
            $r.info_name = "edit_log={0} edit_ok={1} file_name='{2}'" -f ($null -ne $edit), $(if ($edit) { $edit.ok } else { '' }), $fileName
            if ($fileName) { $curName = $fileName }
          } else { $r.name_committed = 'skipped (the settings window lost the foreground before typing)' }
          $closedHow = CloseSettings
          $r.editor_closed = if ($closedHow -eq 'closed') { $true } elseif ($closedHow -eq 'not-closed') { $false } else { "skipped ($script:why)" }
        }
        SkipAll @('name_committed', 'editor_closed') 'the settings window did not come to the front: see editor_opened'
        $titled = TestRuleCount (RulesOf (WsById (ReadWs) $wsId)) -WithTitleRule
        $r.title_rules_written = if ($savedOk) { ($titled -eq 3) } else { 'skipped (the three test windows were not all saved: see workspace_saved)' }
        $r.info_title_rules = '{0}/3 test window rules have titleIncludes equal to the window title' -f $titled
      } else {
        $r.workspace_saved = $false
        $r.info_save = if ($save) { 'ok={0} reason={1}' -f $save.ok, $save.reason } else { 'no workspace.save log from the palette within 6 s' }
        SkipAll $step2 'nothing was saved: see workspace_saved'
      }
      Pump 500
    } else { SkipAll $step2 $script:why }
  } catch { $r['error_2_save'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 3. 흐트러뜨리기: A를 (+300,+200) 옮긴 뒤 최소화, B 최대화, C는 보통 상태로 되돌려 옮긴다. 바뀌지 않은 창의 4단계 판정은 skipped
  $moved = @{ A = $false; B = $false; C = $false }
  try {
    if ($wsId) {
      $ra = WindowRectOf $A
      MoveForm $A ($ra.x + 300) ($ra.y + 200) $ra.width $ra.height
      SetFormState $A 'Minimized'
      SetFormState $B 'Maximized'
      SetFormState $C 'Normal'
      MoveForm $C ($wa.x + 220) ($wa.y + 180) 700 440
      Pump 400
      $moved.A = ((StateOf $A) -eq 'Minimized')
      $moved.B = ((StateOf $B) -eq 'Maximized')
      $moved.C = ((StateOf $C) -eq 'Normal')
      $r.info_disarranged = 'A_minimized={0} B_maximized={1} C_normal={2}' -f $moved.A, $moved.B, $moved.C
    }
  } catch { $r['error_3_disarrange'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 4. 팔레트 '@<이름>' → Enter → palette.run이 그 워크스페이스이고 workspace.restore(출처 palette) 성공 → A·B 테두리가 저장 위치 ±10px,
  #    C 최대화, A·B 보통 상태, 앞 창이 불러오기 전 창(B). B가 배율이 다른 모니터에 있으면 그 ±10px이 mixed_dpi
  $step4 = @('palette_ran_workspace', 'a_within_10px', 'b_within_10px', 'c_maximized', 'ab_normal', 'focus_restored', 'mixed_dpi')
  $rest4 = $null
  try {
    # 이름을 읽지 못했으면 검색어가 '@'만 남아 맨 위 "지금 배치 저장"이 새로 저장하므로 진행하지 않는다
    if (-not $wsId -or -not $curName) { SkipAll $step4 'no saved workspace with a readable name: see workspace_saved' }
    elseif (Ask ('@' + $curName) $B) {
      $mark = LogMark
      PressEnter
      $run = WaitLog $mark 'palette.run' { $true } 3000
      $rest4 = WaitRestore $mark 'palette'
      Pump 1000
      $ran = ($null -ne $run -and $run.id -eq "workspace:$wsId" -and $null -ne $rest4 -and $rest4.ok -eq $true -and $rest4.id -eq $wsId)
      $r.palette_ran_workspace = $ran
      $r.info_restore_palette = 'ran={0} {1}' -f (RunText $run), (RestoreText $rest4)
      if ($ran) {
        $fgTitle = (Fg).Title
        $dA = PxDiff (FrameOf $A) $saved.A
        $dB = PxDiff (FrameOf $B) $saved.B
        $r.a_within_10px = if ($moved.A) { WithinTen $dA } else { 'skipped (A was not minimized before the restore)' }
        $r.b_within_10px = if ($moved.B) { WithinTen $dB } else { 'skipped (B was not maximized before the restore)' }
        $r.info_a_diff = DiffText $dA
        $r.info_b_diff = DiffText $dB
        $r.c_maximized = if (-not $cMaxAtSave) { 'skipped (C was not maximized when saved)' } elseif (-not $moved.C) { 'skipped (C was not back to normal before the restore)' } else { (StateOf $C) -eq 'Maximized' }
        $r.ab_normal = if ($moved.A -and $moved.B) { ((StateOf $A) -eq 'Normal' -and (StateOf $B) -eq 'Normal') } else { 'skipped (A was not minimized or B was not maximized before the restore)' }
        $r.focus_restored = ($fgTitle -eq $titles.B -and $rest4.restoredFocus -eq $true)
        $r.info_foreground_after_restore = $fgTitle
        $r.mixed_dpi = if (-not $other) { 'skipped (one monitor, or no second monitor with a different scale)' } elseif (-not $moved.B) { 'skipped (B was not maximized before the restore)' } else { WithinTen $dB }
      }
      SkipAll $step4 'Enter did not load the test workspace: see palette_ran_workspace'
    } else { SkipAll $step4 $script:why }
  } catch { $r['error_4_restore'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 5. A를 닫고 다시 불러오기 → workspace.restore 성공이고 missing이 4단계보다 1 많다(닫은 A를 찾지 못함)
  try {
    if (-not $rest4 -or $rest4.ok -ne $true) { $r.missing_reported = 'skipped (step 4 did not load the workspace: see palette_ran_workspace)' }
    else {
      $A.Close(); $A = $null; Pump 500
      if (Ask ('@' + $curName) $B) {
        $mark = LogMark
        PressEnter
        $run = WaitLog $mark 'palette.run' { $true } 3000
        $rest5 = WaitRestore $mark 'palette'
        Pump 600
        $r.missing_reported = ($null -ne $rest5 -and $rest5.ok -eq $true -and $rest5.id -eq $wsId -and [int]$rest5.missing -eq ([int]$rest4.missing + 1))
        $r.info_restore_after_close = 'ran={0} {1} (step 4: missing={2} placed={3})' -f (RunText $run), (RestoreText $rest5), $rest4.missing, $rest4.placed
      } else { $r.missing_reported = "skipped ($script:why)" }
    }
  } catch { $r['error_5_missing'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 6. 팔레트 '@<이름>' → Ctrl+Enter(Ctrl 0.3초 늦게 뗌) → palette.run workspace-edit:<id> → 설정 창 워크스페이스 탭이 앞에 열림(이름 칸 선택) →
  #    Tab 두 번(이름 칸 → 별칭 칸 → 단축키 '정하기' 단추, Task 8 화면의 DOM 순서: 오른쪽 열은 DOM에서 편집 칸보다 앞이라 이름 칸 뒤 Tab에 걸리지 않는다) →
  #    Enter(녹화 칸이 열림) → WsHotkey(보조키 0.3초 늦게 뗌) → hotkey.change(id workspace:<id>, ok)와 workspaces.json의 hotkey →
  #    캡처 m7-ws-editor → Esc·Alt+F4로 닫기
  $hotkeyOk = $false
  try {
    if (-not $wsId -or -not $curName) { SkipAll @('ctrl_enter_opens_editor', 'hotkey_registered') 'no saved workspace with a readable name: see workspace_saved' }
    elseif (Ask ('@' + $curName) $B) {
      $mark = LogMark
      HoldCombo 'ctrl+enter' 300
      $run = WaitLog $mark 'palette.run' { $_.id -eq "workspace-edit:$wsId" } 3000
      $opened = WaitLog $mark 'settings.window' { $_.tab -eq 'workspace' } 5000
      $front = WaitSettingsFront 5000
      $r.ctrl_enter_opens_editor = ($null -ne $run -and $null -ne $opened -and $front -ne [IntPtr]::Zero)
      $r.info_ctrl_enter = 'edit_run={0} settings.window={1} reused={2} in_front={3} foreground={4}' -f ($null -ne $run), ($null -ne $opened), $(if ($opened) { $opened.reused } else { '' }), ($front -ne [IntPtr]::Zero), (Fg).Title
      if ($front -ne [IntPtr]::Zero) {
        Pump 2000
        if ((SettingsFront) -ne [IntPtr]::Zero) {
          TapHuman 0x09; Pump 250
          TapHuman 0x09; Pump 250
          TapHuman 0x0D; Pump 700
          $mark2 = LogMark
          HoldCombo $WsHotkey 300
          $hk = WaitLog $mark2 'hotkey.change' { $_.id -eq "workspace:$wsId" } 4000
          $wsH = WaitWs $wsId { param($w) $w.hotkey -eq $WsHotkey } 3000
          $fileKey = if ($wsH -and $wsH.hotkey) { [string]$wsH.hotkey } else { '' }
          $hotkeyOk = ($null -ne $hk -and $hk.ok -eq $true -and $fileKey -eq $WsHotkey)
          $r.hotkey_registered = $hotkeyOk
          $r.info_hotkey = "change_log={0} ok={1} reason={2} file_hotkey='{3}'" -f ($null -ne $hk), $(if ($hk) { $hk.ok } else { '' }), $(if ($hk) { $hk.reason } else { '' }), $fileKey
          # 녹화 칸은 다른 앱이 쓰는 조합을 검사에서 거절하고 바꾸지 않으므로 hotkey.change가 남지 않는다(포커스가 녹화 칸에 닿지 않았을 때도 같다)
          if (-not $hk) { $r.info_hotkey_hint = 'no hotkey.change: the focus did not reach the recorder, or another app uses the combination (m7-ws-editor shows which)' }
          Pump 600
          $h = SettingsFront
          if ($h -ne [IntPtr]::Zero) { $fr = FrameOf $h; if ($fr) { ShotRect 'm7-ws-editor' $fr 1 } }
        } else { $r.hotkey_registered = 'skipped (the settings window lost the foreground before Tab)' }
        $closedHow = CloseSettings
        $r.info_editor_closed_after_hotkey = if ($closedHow -eq 'closed') { 'closed' } else { "$closedHow ($script:why)" }
      }
      SkipAll @('hotkey_registered') 'the settings window did not come to the front: see ctrl_enter_opens_editor'
    } else { SkipAll @('ctrl_enter_opens_editor', 'hotkey_registered') $script:why }
  } catch { $r['error_6_hotkey'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 6-2. B를 저장 위치에서 옮기고 WsHotkey(보조키 0.3초 늦게 뗌) → workspace.restore(출처 hotkey) 성공, B 테두리가 저장 위치 ±10px
  try {
    if (-not $hotkeyOk) { $r.hotkey_restores = 'skipped (the workspace hotkey was not registered: see hotkey_registered)' }
    else {
      Nudge $B 250 150
      $off = PxDiff (FrameOf $B) $saved.B
      if (-not (MovedAway $off)) { $r.hotkey_restores = 'skipped (B did not move away from the saved position)' }
      elseif (-not (FocusWin $B)) { $r.hotkey_restores = "skipped (the test window $($titles.B) did not come to the front)" }
      else {
        $mark = LogMark
        HoldCombo $WsHotkey 300
        $rest6 = WaitRestore $mark 'hotkey'
        Pump 800
        $dB = PxDiff (FrameOf $B) $saved.B
        $r.hotkey_restores = ($null -ne $rest6 -and $rest6.ok -eq $true -and $rest6.id -eq $wsId -and (WithinTen $dB))
        $r.info_hotkey_restore = '{0} b_diff: {1}' -f (RestoreText $rest6), (DiffText $dB)
      }
    }
  } catch { $r['error_6_hotkey_restore'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 6-3(선택). 말랑 메이트 조종 중 WsHotkey: 조종이 먼저 끝나고(pet.control end reason handoff가 workspace.restore보다 앞 줄),
  #    불러온 뒤 앞 창이 펫 창이 아니라 시험 창(B)이다(M6 최종 검토 I1). 펫이 숨었거나 조종을 시작하지 못하면 skipped
  $ctl = @('control_ends_before_restore', 'control_focus_returns')
  try {
    if (-not $hotkeyOk) { SkipAll $ctl 'the workspace hotkey was not registered: see hotkey_registered' }
    elseif (-not (PetWindowRect $scale)) { SkipAll $ctl 'the pet is hidden (pet visibility is off in the settings) or its window was not found' }
    else {
      Nudge $B -200 120
      if (-not (FocusWin $B)) { SkipAll $ctl "the test window $($titles.B) did not come to the front" }
      else {
        $startMark = LogMark
        if (-not (StartControl)) { SkipAll $ctl 'pet control could not be started (the pet menu did not open, or no pet.control start after the first pet menu row)' }
        else {
          Pump 600
          $ended = (@(LogsAfter $startMark 'pet.control' | Where-Object { $_.phase -eq 'end' }).Count -gt 0)
          if ($ended -or -not (ForegroundIsPetWindow $scale)) {
            SkipAll $ctl 'control ended, or the pet window did not take the foreground, before the hotkey'
            if (-not $ended) { EndControlIfAny }
          } else {
            $mark = LogMark
            HoldCombo $WsHotkey 300
            $rest7 = WaitRestore $mark 'hotkey'
            Pump 800
            $lines = IndexedLogs $mark
            $endItem = FirstOf $lines { param($e) $e.event -eq 'pet.control' -and $e.phase -eq 'end' }
            $restItem = FirstOf $lines { param($e) $e.event -eq 'workspace.restore' -and $e.source -eq 'hotkey' }
            $r.control_ends_before_restore = ($null -ne $endItem -and $endItem.ev.reason -eq 'handoff' -and $null -ne $restItem -and $restItem.idx -gt $endItem.idx -and $restItem.ev.ok -eq $true)
            $r.info_control = 'end_line={0} end_reason={1} restore_line={2} {3}' -f $(if ($endItem) { $endItem.idx } else { -1 }), $(if ($endItem) { $endItem.ev.reason } else { '' }), $(if ($restItem) { $restItem.idx } else { -1 }), (RestoreText $rest7)
            if ($rest7) {
              $fgTitle = (Fg).Title
              $r.control_focus_returns = ($fgTitle -eq $titles.B -and -not (ForegroundIsPetWindow $scale))
              $r.info_foreground_after_control_restore = $fgTitle
            } else { $r.control_focus_returns = 'skipped (no workspace.restore from the hotkey during control)' }
            if (@(LogsAfter $startMark 'pet.control' | Where-Object { $_.phase -eq 'end' }).Count -eq 0) { EndControlIfAny }
          }
        }
      }
    }
  } catch { $r['error_6_control'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)"; try { EndControlIfAny } catch { } }

  # 7. 바: B를 옮기고 앞에 둔 채 워크스페이스 단추(bar.place와 BarLayout으로 위치 계산) 클릭 → flyout.show kind workspace-menu, 앞 창 그대로 →
  #    캡처 m7-flyout-workspaces → 둘째 행(시험이 저장한 워크스페이스. 첫 행은 늘 기본 워크스페이스 '화면 감추기'라 누르지 않는다) 클릭 →
  #    workspace.restore(출처 bar) 성공, B 테두리가 저장 위치 ±10px
  $step7 = @('bar_menu_shown', 'menu_kept_focus', 'bar_restores')
  try {
    $place = LastBarPlace
    if (-not $wsId) { SkipAll $step7 'no workspace was saved: see workspace_saved' }
    elseif (-not $place) { SkipAll $step7 'no bar.place log in this app run (the bar is off or did not start)' }
    elseif ($place.shape -ne 'edge' -or $place.edge -ne 'right') { SkipAll $step7 ('the bar is not the right edge strip ({0} {1}): t21-run.ps1 sets it' -f $place.shape, $place.edge) }
    elseif ((BarLayout $place.items $place.shape)['_height'] -ne [int]$place.bounds.height) { SkipAll $step7 'the computed bar layout height differs from the bar height: the button position would be a guess' }
    else {
      $bs = [double]$place.scale
      Nudge $B 150 200
      $off = PxDiff (FrameOf $B) $saved.B
      $pt = BarPointPx $place 'workspace'
      if (-not (MovedAway $off)) { SkipAll $step7 'B did not move away from the saved position' }
      elseif (-not (FocusWin $B)) { SkipAll $step7 "the test window $($titles.B) did not come to the front" }
      elseif (-not (WaitPetAway ($pt.x / $bs) ($pt.y / $bs))) { SkipAll $step7 'the pet stays over the bar workspace button' }
      else {
        $mark = LogMark
        ClickAt $pt.x $pt.y
        $menu = WaitLog $mark 'flyout.show' { $_.kind -eq 'workspace-menu' } 2000
        $r.bar_menu_shown = ($null -ne $menu)
        Pump 300
        if ($menu) {
          $fgTitle = (Fg).Title
          $r.menu_kept_focus = ($fgTitle -eq $titles.B)
          $r.info_foreground_with_menu = $fgTitle
          Pump 200
          ShotRect 'm7-flyout-workspaces' $menu.bounds $bs
          # 메뉴 카드 안 둘째 행 가운데: 안쪽 여백 4 + 머리 28 + 첫 행(화면 감추기) 52 + 두 줄 행 52의 절반 = 110
          $card = MenuCard $menu.bounds
          $rowX = $card.x + $card.width / 2
          $rowY = $card.y + 110
          if (-not (WaitPetAway $rowX $rowY)) { $r.bar_restores = 'skipped (the pet covers the second menu row)' }
          else {
            $mark2 = LogMark
            ClickAt ([int][Math]::Round($rowX * $bs)) ([int][Math]::Round($rowY * $bs))
            $rest8 = WaitRestore $mark2 'bar'
            Pump 800
            $dB = PxDiff (FrameOf $B) $saved.B
            $r.bar_restores = ($null -ne $rest8 -and $rest8.ok -eq $true -and $rest8.id -eq $wsId -and (WithinTen $dB))
            $r.info_bar_restore = '{0} b_diff: {1}' -f (RestoreText $rest8), (DiffText $dB)
          }
        }
        SkipAll @('menu_kept_focus', 'bar_restores') 'no workspace menu: see bar_menu_shown'
      }
      Away
    }
  } catch { $r['error_7_bar'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 7-2. 화면 감추기(기본 워크스페이스, 2026-11-12): C를 최소화한 채 팔레트 '@화면 감추기' → 목록 끝 '지금 배치로 바꾸기' 줄(End) → Enter로
  #    B가 보이는 배치를 화면 감추기에 저장(workspace.save op recapture, id builtin-hide) → C를 보통 상태로 되돌린 뒤 '@화면 감추기' Enter →
  #    workspace.hide(출처 palette)이고 저장하지 않은 C는 최소화, 저장한 B는 최소화가 아님 → 한 번 더 '@화면 감추기' Enter → workspace.unhide이고
  #    C가 보통 상태로 돌아온다. 이 단계는 열린 다른 앱 창도 잠시 내렸다가 되돌린다. 기본 워크스페이스가 없거나 앞 단계가 성립하지 않으면 skipped
  $hideKeys = @('hide_saved', 'hide_minimizes_others', 'hide_press_again_restores')
  try {
    $hideName = '화면 감추기'
    if (-not $builtinAtStart) { SkipAll $hideKeys 'workspaces.json had no built-in workspace at start: see builtin_created' }
    elseif (-not $B -or -not $C) { SkipAll $hideKeys 'the test windows B and C are not both open' }
    else {
      SetFormState $C 'Minimized'
      if ((StateOf $B) -ne 'Normal') { SetFormState $B 'Normal' }
      Pump 400
      if ((StateOf $C) -ne 'Minimized') { SkipAll $hideKeys 'C did not minimize before saving into the built-in workspace' }
      elseif (-not (Ask ('@' + $hideName) $B)) { SkipAll $hideKeys $script:why }
      else {
        ExtTapHuman 0x23; Pump 300
        $mark = LogMark
        PressEnter
        $hs = WaitLog $mark 'workspace.save' { $_.source -eq 'palette' } 6000
        $hideSaved = ($null -ne $hs -and $hs.ok -eq $true -and $hs.id -eq 'builtin-hide' -and $hs.op -eq 'recapture')
        $r.hide_saved = $hideSaved
        $r.info_hide_save = if ($hs) { 'ok={0} op={1} id_is_builtin={2} windows={3}' -f $hs.ok, $hs.op, ($hs.id -eq 'builtin-hide'), $hs.windows } else { 'no workspace.save within 6 s' }
        Pump 800
        ClosePalette
        if (-not $hideSaved) { SkipAll $hideKeys 'nothing was saved into the built-in workspace: see hide_saved' }
        else {
          SetFormState $C 'Normal'
          Pump 400
          if ((StateOf $C) -ne 'Normal') { SkipAll $hideKeys 'C did not come back to normal before hiding' }
          elseif (-not (Ask ('@' + $hideName) $B)) { SkipAll $hideKeys $script:why }
          else {
            $mark = LogMark
            PressEnter
            $hd = WaitLog $mark 'workspace.hide' { $_.source -eq 'palette' } 15000
            Pump 800
            $r.hide_minimizes_others = ($null -ne $hd -and $hd.id -eq 'builtin-hide' -and (StateOf $C) -eq 'Minimized' -and (StateOf $B) -ne 'Minimized')
            $r.info_hide = if ($hd) { 'minimized={0} elevated={1} hung={2} failed={3} saved={4} desktop={5} pinned={6} C={7} B={8}' -f $hd.minimized, $hd.elevated, $hd.hung, $hd.failed, $hd.saved, $hd.desktop, $hd.pinned, (StateOf $C), (StateOf $B) } else { 'no workspace.hide within 15 s' }
            if (-not $hd -or (StateOf $C) -ne 'Minimized') { SkipAll @('hide_press_again_restores') 'the first press did not minimize C: see hide_minimizes_others' }
            elseif (-not (Ask ('@' + $hideName) $B)) { SkipAll @('hide_press_again_restores') $script:why }
            else {
              $mark = LogMark
              PressEnter
              $uh = WaitLog $mark 'workspace.unhide' { $_.source -eq 'palette' } 15000
              Pump 800
              $r.hide_press_again_restores = ($null -ne $uh -and $uh.id -eq 'builtin-hide' -and (StateOf $C) -eq 'Normal')
              $hd2 = @(LogsAfter $mark 'workspace.hide' | Select-Object -First 1)
              $r.info_unhide = if ($uh) { 'restored={0} skipped={1} focused={2} C={3}' -f $uh.restored, $uh.skipped, $uh.focused, (StateOf $C) } elseif ($hd2.Count -gt 0) { 'the second press hid again (why={0})' -f $hd2[0].why } else { 'no workspace.unhide within 15 s' }
            }
          }
        }
      }
    }
  } catch { $r['error_7_hide'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 8. 로그에 시험 창 제목('SureMate-WS')·워크스페이스 이름('smoke ws'와 기본 이름)·이름을 담는 키가 없다(id·건수·까닭·시간만).
  #    아무것도 저장하지 않았으면 제목·이름이 앱을 거치지 않았으므로 판정하지 않는다
  $appLines = @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $startLines) -join "`n"
  # 앱 로그가 비어 있으면(로그를 읽지 못했거나 앱이 쓰지 않았으면) 아무것도 없다는 판정이 거짓 True가 되므로, 이번 실행의 palette.run·workspace.save 줄이 있어야 판정한다
  $appLogLines = @(NewLogs 'palette.run').Count + @(NewLogs 'workspace.save').Count
  if (-not $wsId) { SkipAll @('log_has_no_titles', 'log_has_no_names', 'log_has_no_typed_text') 'nothing was saved: see workspace_saved' }
  elseif ($appLogLines -eq 0) { SkipAll @('log_has_no_titles', 'log_has_no_names', 'log_has_no_typed_text') 'no app log lines' }
  else {
    $r.log_has_no_titles = -not $appLines.Contains('SureMate-WS')
    # 기본 워크스페이스 이름('화면 감추기')도 로그에 없어야 한다(id builtin-hide만)
    $names = @(@($wsName, $defaultName, '화면 감추기') | Where-Object { $_ })
    $found = @($names | Where-Object { $appLines.Contains($_) })
    $r.log_has_no_names = ($found.Count -eq 0)
    if ($found.Count -gt 0) { $r.info_names_in_log = $found -join ', ' }
    $r.log_has_no_typed_text = -not ($appLines -match $typedKeyPattern)
  }
  $r.info_foreground_end = (Fg).Title
} catch {
  $r.error = "$_ at line $($_.InvocationInfo.ScriptLineNumber)"
} finally {
  foreach ($f in @($A, $B, $C)) { if ($f) { try { $f.Close() } catch { } } }
  $r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
}
