# t23: 사내 프로그램 열기(2026-11-13: 사내 메신저·Ttree 열기 명령과 Ttree 근무 기록 프롬프트)를 실제 앱에서 확인한다.
# t23-run.ps1로 실행한다(설정을 잠시 바꾸고 워크스페이스·기억한 문장·사용 기록·사용자 단어 목록을 비운 채 시작해 끝나면 되돌림).
# 순서(사용자 지시): (a) 프롬프트 → (b) Ttree → (c) 메신저(마지막). (a)의 프롬프트는 고른 글을 직전 창에서 가져온다(앱이 그 창에 Ctrl+C를 보낸다).
# 그래서 직전 창이 시험 창일 때, 메신저·Ttree를 앞으로 가져오기 전에 한다. (c)에서 Enter를 뗀 뒤로는 키를 하나도 보내지 않는다.
#
# 안전 규칙(사용자 지시, 2026-11-13):
# - 키를 보낼 때마다(누름·뗌, 글자 하나씩) 먼저 앞 창이 Sure-Mate 앱이나 이 시험 창인지 확인한다. 아니면 그 자리에서 멈추고 그 뒤로 키를 보내지 않는다(aborted 줄).
#   메신저에 Enter가 잘못 들어가면 대화가 전송되고, Ttree에 키가 잘못 들어가면 근무 시작·컴퓨터 종료가 눌릴 수 있다.
#   Sure-Mate 판정은 smoke-lib IsApp(프로세스 이름 electron·Sure-Mate)보다 좁게, 이 저장소의 electron·Sure-Mate 프로세스 번호(AppProcs)로 한다.
# - 메신저·Ttree 창은 누르지도, 입력하지도, 닫지도(WM_CLOSE) 않는다. 창 제목·내용은 읽지도 출력하지도 않고 프로세스 이름만 본다.
#   그래서 앞 창 제목을 읽는 smoke-lib의 Fg·IsApp, 확인 없이 키·마우스 입력을 보내는 도우미, 화면 캡처는 아래에서 막는다.
#   메신저·Ttree가 앞에 있으면 시험 창을 가져올 때 Alt 누름도 입력 연결(AttachThreadInput)도 쓰지 않는다(SetForegroundWindow만).
# - 프롬프트 확인 화면에서는 Enter를 누르지 않고 Esc로만 닫는다. Enter는 이번에 연 팔레트가 검색 화면 그대로일 때만 누른다(로그로 확인).
# - 꺼져 있는 메신저·Ttree는 켜지 않는다. 설치되어 있는데 꺼져 있으면 키를 보내기 전에 멈춘다. 앱이 켠 프로세스는 dev 앱의 자식이 되어
#   run-smoke.ps1의 정리(taskkill /T)가 함께 끝내기 때문이다. 켜져 있으면 앱이 실행 파일을 다시 열어도 한 번만 실행되는 앱이라 새 프로세스는 곧 끝난다.
#   끝나지 않고 남으면 warning_copies_left 줄로 알린다.
#
# 판정 줄(모두 True여야 한다). 판정 줄이 없거나 error·error_*·aborted 줄이 있으면 그 단계부터 실패한 것이다. skipped (까닭)은 판정하지 않은 것이다.
# - prompt_top: 'Ttree 기록으로 주간보고 써줘' → Enter → palette.run id가 prompt:ttree-worklog
# - prompt_confirm: prompt.prepare의 templateId가 ttree-worklog이고 확인 화면(palette.show mode confirm)이 열렸다
# - prompt_not_confirmed: 확인 화면을 Esc로만 닫아 prompt.run이 없다
# - ttree_top·ttree_opened·ttree_foreground: '휴가 신청' → Enter → palette.run id가 cmd.open-ttree, 12초 안에 apps.open(app ttree)의 result가
#   focused·raised·launched, 그 뒤 앞 창 프로세스 이름이 ttree. 그 Ttree 창은 최소화해 둔다(info_ttree_minimized)
# - messenger_top·messenger_opened·messenger_foreground: '메신저 열어줘'로 같은 판정(cmd.open-messenger, app messenger, 프로세스 SURESOFTMessenger)
# - no_keys_after_messenger: 메신저 단계의 Enter를 뗀 뒤 보낸 키가 없다
# - log_has_no_phrases·log_has_no_typed_text: 앱 로그에 입력 문장 조각·문장을 담는 키가 없다(t22와 같은 규칙)
# info_ 줄은 참고값이다: info_prompt·info_ttree·info_messenger(실행한 id, apps.open의 result·ms, 앞 창 프로세스 이름), info_keys_sent(보낸 키 입력 수),
# info_installed·info_running(두 프로그램의 설치·실행 여부). warning_keys_held는 멈출 때 누른 채였던 키다(그 키를 한 번씩 눌렀다 뗀다).
param([string]$Combo = 'Alt+`', [switch]$FromRunner)
# t23-run.ps1만 -FromRunner를 넘긴다. 직접 실행하면 사용자 파일을 비우지 않은 채 시작해 맨 위 후보가 달라질 수 있으므로 멈춘다
if (-not $FromRunner) { 'error = t23-run.ps1로 실행한다(직접 실행하면 설정과 사용자 파일이 시험 상태가 아니다)'; return }
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
# 확인 없이 키·마우스 입력을 보내거나 앞 창 제목을 읽거나 화면을 캡처하는 smoke-lib 도우미는 이 시험에서 막는다(실수로 부르면 입력을 보내기 전에 멈춘다)
foreach ($blocked in @('Fg', 'IsApp', 'Tap', 'Combo', 'TypeAscii', 'TypeUnicode', 'HoldCombo', 'TapHuman', 'ExtTapHuman', 'PaletteOpen', 'NewTestForm', 'MoveTo', 'HoverAt', 'HoverEnter', 'ClickAt', 'DragBy', 'DragPath', 'Shot', 'ShotRect')) {
  Set-Item -Path "Function:\$blocked" -Value ([scriptblock]::Create("throw 't23 blocks $blocked (input without the foreground check, window titles or screen captures)'"))
}
# 키를 보내지 않고 창을 앞으로 가져오고 최소화하는 Win32 선언(W·M7W에 없는 것)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class T23W {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attach, uint attachTo, bool on);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  // Alt+Tab과 같은 창 전환(앞 창에 키를 보내지 않는다). 메신저·Ttree가 앞에 있을 때 시험 창을 가져오는 데 쓴다
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool altTab);
  // 키 없이 target을 앞으로: 앞 창(expected) 스레드의 입력 상태에 잠시 붙어 SetForegroundWindow를 부르고 바로 뗀다.
  // 그사이 앞 창이 바뀌었으면 아무것도 하지 않는다(부르는 쪽이 앞 창이 메신저·Ttree가 아님을 확인한 뒤 부른다)
  public static bool FocusByAttach(IntPtr target, IntPtr expected) {
    IntPtr fg = GetForegroundWindow();
    if (fg != expected) return false;
    uint other = fg == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fg, IntPtr.Zero);
    uint me = GetCurrentThreadId();
    bool attached = other != 0 && other != me && AttachThreadInput(me, other, true);
    try { BringWindowToTop(target); return SetForegroundWindow(target); }
    finally { if (attached) AttachThreadInput(me, other, false); }
  }
}
'@
$r = [ordered]@{}
$appDir = Join-Path $env:APPDATA 'Sure-Mate'
# 시험 문장. 맨 위 후보는 기본 자료로 Vitest가 확인한다(natural-search.test.ts 문장 표, 두 앱이 설치된 PC 기준)
$S = [ordered]@{
  prompt = 'Ttree 기록으로 주간보고 써줘'
  ttree = '휴가 신청'
  messenger = '메신저 열어줘'
}
# 로그에 없어야 하는 입력 조각(앱 id인 ttree·messenger는 로그에 정상으로 나오므로 넣지 않는다)
$phrases = @('기록으로', '주간보고', '써줘', '휴가 신청', '메신저 열어', '열어줘')
# 문장을 담는 키(t22와 같다). 값이 글자·배열일 때만 걸린다
$typedKeyPattern = '"(text|query|sentence|phrase|input|title|name|label|words|aliases)"\s*:\s*["\[]'
# 앞에 있을 때 키도 입력 연결도 쓰지 않는 프로그램(프로세스 이름)
$protected = @('SURESOFTMessenger', 'ttree')
$openOk = @('focused', 'raised', 'launched')
$script:abort = $null   # 안전 규칙으로 멈춘 까닭. 정해지면 그 뒤로 키를 하나도 보내지 않는다
$script:keys = 0        # 보낸 키 입력 수(누름·뗌·글자 하나씩)
$script:held = @{}      # 눌렀는데 아직 떼지 않은 키(멈췄을 때 알린다)
$script:appPids = @()
$script:paletteHwnd = [IntPtr]::Zero
$script:typed = 0
$script:why = ''
$form = $null

# 앞 창의 HWND와 프로세스 번호(제목은 읽지 않는다)
function FgNow {
  $h = [W]::GetForegroundWindow()
  $p = if ($h -ne [IntPtr]::Zero) { [int][W]::Pid($h) } else { 0 }
  [pscustomobject]@{ hwnd = $h; pid = $p }
}
function ProcName([int]$p) {
  if ($p -le 0) { return '(none)' }
  $n = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
  if ($n) { return [string]$n }
  return '(exited)'
}
function IsAppFg($fg) { return ($fg.pid -gt 0 -and $script:appPids -contains $fg.pid) }
function IsTestFg($fg) { return ($null -ne $form -and $fg.hwnd -eq $form.Handle) }
function IsPaletteFg($fg) { return ($script:paletteHwnd -ne [IntPtr]::Zero -and $fg.hwnd -eq $script:paletteHwnd -and (IsAppFg $fg)) }

# 키 입력 하나를 보내도 되는지. 앞 창이 Sure-Mate도 시험 창도 아니면 시험 전체를 멈춘다(예외, 그 뒤로 키 없음).
# need: 'test'(시험 창이어야 함) · 'palette'(이번 팔레트여야 함) · 'any'(안전 규칙만, 키를 뗄 때). need만 맞지 않으면 $false(그 키를 보내지 않고 단계를 건너뛴다)
function Guard([string]$need, [string]$what) {
  if ($script:abort) { throw "aborted: $script:abort" }
  $fg = FgNow
  $isTest = IsTestFg $fg
  if (-not $isTest -and -not (IsAppFg $fg)) {
    $script:abort = "before {0} the foreground window belonged to '{1}', not Sure-Mate or the test window; no key was sent from then on" -f $what, (ProcName $fg.pid)
    throw "aborted: $script:abort"
  }
  if ($need -eq 'test') { return $isTest }
  if ($need -eq 'palette') { return (IsPaletteFg $fg) }
  return $true
}
# 스캔 코드와 함께 키 하나를 누르거나 뗀다(smoke-lib Key). 확인을 통과했을 때만 보내고 $true
function SendKey([byte]$vk, [string]$need, [switch]$Up) {
  $what = if ($Up) { 'key-up 0x{0:X2}' -f $vk } else { 'key-down 0x{0:X2}' -f $vk }
  if (-not (Guard $need $what)) { return $false }
  Key $vk -Up:$Up
  $script:keys++
  if ($Up) { $script:held.Remove([int]$vk) } else { $script:held[[int]$vk] = $true }
  return $true
}
# 사람처럼 0.09초 눌렀다 뗀다. 떼기는 안전 규칙만 확인한다
function TapKey([byte]$vk, [string]$need) {
  if (-not (SendKey $vk $need)) { return $false }
  Pump 90
  [void](SendKey $vk 'any' -Up)
  return $true
}
# 글자마다 팔레트가 앞에 있는지 확인하고 KEYEVENTF_UNICODE로 입력한다(smoke-lib TypeUnicode와 같은 입력, 30ms 간격)
function TypeText([string]$s) {
  M7Ready
  foreach ($ch in $s.ToCharArray()) {
    if (-not (Guard 'palette' 'a typed character')) { return $false }
    if ([M7W]::UnicodeChar($ch) -ne 2) { throw "SendInput did not send a character (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))" }
    $script:keys++
    Pump 30
  }
  return $true
}
# 팔레트 창은 크기가 고정이고(resizable false) 숨겼다 다시 보이는 같은 창이다. palette.show 크기(DIP × 배율)와 같은 앞 앱 창을 팔레트로 기억한다
function LearnPalette($show) {
  $fg = FgNow
  if (-not (IsAppFg $fg)) { return $false }
  $rc = New-Object 'W+RECT'
  if (-not [W]::GetWindowRect($fg.hwnd, [ref]$rc)) { return $false }
  $s = [double]$show.scale; $b = $show.bounds
  $w = $rc.Right - $rc.Left; $h = $rc.Bottom - $rc.Top
  $r.info_palette_rect = '{0}x{1} (palette.show {2:N0}x{3:N0})' -f $w, $h, ($b.width * $s), ($b.height * $s)
  # 창 사각형에는 보이지 않는 테두리(acrylic 창의 크기 조절 테두리)가 더해질 수 있어 48px까지 본다. 바·펫·펼침 창은 크기가 훨씬 달라 섞이지 않는다
  $ok = ([Math]::Abs($w - $b.width * $s) -le 48 -and [Math]::Abs($h - $b.height * $s) -le 48)
  if ($ok) { $script:paletteHwnd = $fg.hwnd }
  return $ok
}
# 단축키를 누른 뒤(mark) 팔레트가 검색 화면으로 열린 채인지: palette.show가 있고, 확인 화면 같은 다른 mode의 palette.show나 palette.hide가 없다
function PaletteStillSearch([int]$mark) {
  $ev = @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $mark | Where-Object { $_ -match '"event":"palette\.(show|hide)"' } | ForEach-Object { $_ | ConvertFrom-Json })
  if ($ev.Count -eq 0) { return $false }
  return (@($ev | Where-Object { $_.event -eq 'palette.hide' -or $_.mode -ne 'search' }).Count -eq 0)
}
# 팔레트 단축키를 사람처럼 누른다(smoke-lib HoldCombo와 같은 타이밍: 보조키를 누른 채 키를 누르고, 보조키는 0.3초 늦게 뗀다).
# 첫 키는 시험 창이 앞에 있을 때만 보낸다(팔레트가 닫힌 뒤 돌아갈 창 = 시험 창). 열리면(palette.show mode search, 3초) 0.4초 기다려 그 창을 팔레트로 기억하고
# { mark; show }를 돌려준다. 아니면 $null(까닭은 $script:why)
function OpenPalette {
  $t = $Combo.ToLower().Split('+')
  $mods = @(); if ($t.Count -gt 1) { $mods = @($t[0..($t.Count - 2)] | ForEach-Object { VkOf $_ }) }
  $main = VkOf $t[-1]
  $downs = @($mods) + @($main)
  $mark = LogMark
  for ($i = 0; $i -lt $downs.Count; $i++) {
    $need = if ($i -eq 0) { 'test' } else { 'any' }
    if (-not (SendKey $downs[$i] $need)) { $script:why = 'the test window was not in front before the palette hotkey'; return $null }
    if ($i -lt $downs.Count - 1) { Pump 40 }
  }
  [void](SendKey $main 'any' -Up)
  Pump 300
  for ($i = $mods.Count - 1; $i -ge 0; $i--) { [void](SendKey $mods[$i] 'any' -Up); Pump 20 }
  $show = WaitLog $mark 'palette.show' { $_.mode -eq 'search' } 3000
  if (-not $show) { $script:why = 'the palette did not open (no palette.show within 3 s)'; return $null }
  Pump 400
  if (-not (LearnPalette $show)) { $script:why = "the palette is not the foreground window (foreground process '{0}')" -f (ProcName (FgNow).pid); return $null }
  return [pscustomobject]@{ mark = $mark; show = $show }
}
# 팔레트가 앞에 있으면 Esc로 닫는다(확인 화면·위키 화면 → 목록 → 닫힘까지 세 번). Enter는 보내지 않는다
function ClosePalette {
  for ($i = 0; $i -lt 3; $i++) {
    if ($script:abort -or -not (IsPaletteFg (FgNow))) { return }
    [void](TapKey 0x1B 'palette')
    Pump 700
  }
}
# 시험 창을 앞으로. 앞 창이 Sure-Mate면 NewTestForm처럼 Alt를 눌러 포커스 잠금을 푼다(키마다 확인). 메신저·Ttree면 SetForegroundWindow만,
# 그 밖의 창(시작할 때의 사용자 창 등)이면 키 없이 입력 연결(FocusByAttach)로 가져온다
function FocusTestWindow {
  for ($i = 0; $i -lt 3; $i++) {
    $fg = FgNow
    if (IsTestFg $fg) { return $true }
    if (IsAppFg $fg) {
      if (SendKey 0x12 'any') { [void][W]::SetForegroundWindow($form.Handle); [void](SendKey 0x12 'any' -Up) }
    } elseif ($protected -contains (ProcName $fg.pid)) {
      [void][W]::SetForegroundWindow($form.Handle)
      # 포커스 권한이 없으면(앞 시험이 메신저를 앞에 두고 끝남) Alt+Tab 같은 창 전환으로 가져온다. 메신저·Ttree에는 키를 보내지 않는다
      if (-not (IsTestFg (FgNow))) { [T23W]::SwitchToThisWindow($form.Handle, $true) }
    } else {
      if (-not [T23W]::FocusByAttach($form.Handle, $fg.hwnd)) {
        # 앞 창이 없거나(전환 중, 시험 프로세스는 숨김으로 시작해 포커스 권한이 없다) 입력 연결이 안 되면 NewTestForm처럼 Alt를 눌러
        # 포커스 잠금을 푼다. 누르기 직전에 앞 창이 메신저·Ttree가 아닌지 다시 본다(그 앱에는 키를 보내지 않는다)
        $again = FgNow
        if (-not ($protected -contains (ProcName $again.pid))) {
          Key 0x12; $script:keys++
          [void][W]::SetForegroundWindow($form.Handle)
          Key 0x12 -Up
        }
      }
    }
    $form.Activate(); Pump 400
  }
  return (IsTestFg (FgNow))
}
# 팔레트를 열고 글을 친다. 성공하면 OpenPalette의 { mark; show }, 아니면 $null(까닭은 $script:why, 그 단계는 skipped)
function Ask([string]$text) {
  ClosePalette
  if (-not (FocusTestWindow)) { $script:why = "could not bring the test window to the front (foreground process '{0}')" -f (ProcName (FgNow).pid); return $null }
  $o = OpenPalette
  if (-not $o) { return $null }
  if (-not (TypeText $text)) { $script:why = 'the palette left the foreground while typing'; return $null }
  $script:typed++
  Pump 900
  CapturePalette ('t23-before-enter-{0}' -f $script:typed)
  return $o
}
# Sure-Mate 창 하나(DIP 사각형, 펫 창)만 찍는다(%TEMP%\sure-mate-smoke). 다른 창·화면 전체는 찍지 않는다
function CaptureRect([string]$name, $rect, [double]$scale) {
  Add-Type -AssemblyName System.Drawing
  $x = [int][Math]::Round($rect.x * $scale); $y = [int][Math]::Round($rect.y * $scale)
  $w = [int][Math]::Round($rect.width * $scale); $h = [int][Math]::Round($rect.height * $scale)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size $w, $h))
    $dir = Join-Path $env:TEMP 'sure-mate-smoke'
    New-Item -ItemType Directory -Force $dir | Out-Null
    $bmp.Save((Join-Path $dir "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $g.Dispose(); $bmp.Dispose() }
}
# 팔레트 창만 찍는다(판정이 틀렸을 때 입력칸과 목록을 보려고, %TEMP%\sure-mate-smoke). 다른 창·화면 전체는 찍지 않는다
function CapturePalette([string]$name) {
  if ($script:paletteHwnd -eq [IntPtr]::Zero) { return }
  $rc = New-Object 'W+RECT'
  if (-not [W]::GetWindowRect($script:paletteHwnd, [ref]$rc)) { return }
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap ($rc.Right - $rc.Left), ($rc.Bottom - $rc.Top)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CopyFromScreen($rc.Left, $rc.Top, 0, 0, $bmp.Size)
    $dir = Join-Path $env:TEMP 'sure-mate-smoke'
    New-Item -ItemType Directory -Force $dir | Out-Null
    $bmp.Save((Join-Path $dir "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $g.Dispose(); $bmp.Dispose() }
}
# 맨 위 행을 Enter로 실행한다. 이번 팔레트가 검색 화면 그대로일 때만(확인 화면에서는 누르지 않는다). Enter는 0.12초 뒤 뗀다
# (앱은 Enter·보조키를 뗄 때까지 팔레트를 그대로 두므로 뗄 때도 팔레트가 앞에 있다)
function PickTop($o) {
  if (-not (PaletteStillSearch $o.mark)) { $script:why = 'the palette left the search screen before Enter'; return $false }
  if (-not (SendKey 0x0D 'palette')) { $script:why = 'the palette was not in front before Enter'; return $false }
  Pump 120
  [void](SendKey 0x0D 'any' -Up)
  return $true
}
# 앞 창 프로세스 이름이 name이 될 때까지 기다린다(키 없음). 마지막으로 본 앞 창(hwnd·pid·process)을 돌려준다
function WaitFgProcess([string]$name, [int]$ms) {
  $end = (Get-Date).AddMilliseconds($ms)
  do {
    $fg = FgNow; $n = ProcName $fg.pid
    if ($n -eq $name) { break }
    Pump 100
  } while ((Get-Date) -lt $end)
  return [pscustomobject]@{ hwnd = $fg.hwnd; pid = $fg.pid; process = $n }
}
# 설치 위치 후보(앱 app-commands.ts KNOWN_APPS.paths와 같다. 값이 없는 환경 변수의 후보는 보지 않는다). 경로는 출력하지 않는다
function EnvPath([string]$var, [string]$rest) { $v = [Environment]::GetEnvironmentVariable($var); if ($v) { return (Join-Path $v $rest) }; return $null }
function Installed([string[]]$candidates) {
  foreach ($c in $candidates) { if ($c -and (Test-Path -LiteralPath $c)) { return $true } }
  return $false
}
function Running([string]$name) { return (@(Get-Process -Name $name -ErrorAction SilentlyContinue).Count -gt 0) }
# 앱이 다시 연 실행 파일 가운데 부모가 dev 앱 프로세스인 것(프로세스 번호만 본다)
function CopiesUnderApp([string]$exe) {
  $ids = @(AppProcs | ForEach-Object { $_.Id })
  @(Get-CimInstance -ClassName Win32_Process -Filter "Name='$exe'" -Property ProcessId, ParentProcessId -ErrorAction SilentlyContinue | Where-Object { $ids -contains [int]$_.ParentProcessId })
}
function RunText($run) { if ($run) { return [string]$run.id }; return 'none' }
function OpenText($open) { if ($open) { return ('app={0} result={1} ms={2}' -f $open.app, $open.result, $open.ms) }; return 'no apps.open within 12 s' }
# 단계가 예외로 끝났을 때: 안전 규칙으로 멈췄으면 그 단계 첫 판정 줄을 skipped로 남기고(까닭은 aborted 줄), 아니면 error_<단계> 줄
function StepFailed([string]$key, [string]$errKey, $err) {
  if ($script:abort) { if (-not $r.Contains($key)) { $r[$key] = 'skipped (aborted: see aborted)' } }
  else { $r[$errKey] = "$err at line $($err.InvocationInfo.ScriptLineNumber)" }
}

$appStepRan = $false
$keysAtMessenger = $null
try {
  # 0. 시작 조건(키를 보내기 전). 0-1: t23-run.ps1이 비운 상태인지. 앱은 시작할 때 기본 워크스페이스 '화면 감추기'(id builtin-hide)를 만들므로
  #    workspaces.json에 그것만 있으면 빈 상태다(t22와 같다)
  $left = @(@('phrase-map.json', 'usage.json', 'intents.json') | Where-Object { Test-Path (Join-Path $appDir $_) })
  $wsPath = Join-Path $appDir 'workspaces.json'
  if (Test-Path $wsPath) {
    $wsDoc = $null; try { $wsDoc = Get-Content $wsPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
    if (-not $wsDoc) { $left += 'workspaces.json (unreadable)' }
    elseif (@(@($wsDoc.workspaces) | Where-Object { $_ -and $_.id -ne 'builtin-hide' }).Count -gt 0) { $left += 'workspaces.json (a workspace other than the built-in one)' }
  }
  if ($left.Count -gt 0) { throw "t23-run.ps1로 실행한다(시작할 때 없어야 하는 파일이 있다: $($left -join ', '))" }
  $r.info_palette_hotkey = $Combo
  # 0-2. 키를 보내도 되는 앞 창 판정에 쓰는 Sure-Mate 프로세스 번호
  $script:appPids = @(AppProcs | ForEach-Object { $_.Id })
  $r.info_app_processes = $script:appPids.Count
  if ($script:appPids.Count -eq 0) { throw 'Sure-Mate 앱 프로세스(이 저장소의 electron 또는 Sure-Mate)를 찾지 못했다' }
  # 0-3. 두 프로그램의 설치·실행 여부. 설치되어 있는데 꺼져 있으면 멈춘다(맨 위 설명: 앱이 켠 프로세스는 정리 때 함께 끝난다)
  $installed = @{
    messenger = Installed @((EnvPath 'ProgramFiles' 'SURESOFTMessenger\SURESOFTMessenger.exe'), (EnvPath 'ProgramFiles(x86)' 'SURESOFTMessenger\SURESOFTMessenger.exe'), (EnvPath 'LOCALAPPDATA' 'Programs\SURESOFTMessenger\SURESOFTMessenger.exe'))
    ttree = Installed @((EnvPath 'SystemDrive' 'ttree\ttree.exe'), 'C:\ttree\ttree.exe', (EnvPath 'ProgramFiles' 'ttree\ttree.exe'), (EnvPath 'LOCALAPPDATA' 'Programs\ttree\ttree.exe'))
  }
  $running = @{ messenger = (Running 'SURESOFTMessenger'); ttree = (Running 'ttree') }
  $r.info_installed = 'messenger={0} ttree={1}' -f $installed.messenger, $installed.ttree
  $r.info_running = 'messenger={0} ttree={1}' -f $running.messenger, $running.ttree
  foreach ($k in @('ttree', 'messenger')) {
    if ($installed[$k] -and -not $running[$k]) {
      $label = if ($k -eq 'ttree') { 'Ttree(ttree.exe)' } else { '사내 메신저(SURESOFTMessenger.exe)' }
      throw ("{0}: 설치되어 있지만 꺼져 있다. 팔레트로 고르면 dev 앱이 켜고, 그 프로세스는 dev 앱의 자식이라 run-smoke.ps1의 정리(taskkill /T)가 함께 끝낸다. 직접 켠 뒤 다시 실행한다(키는 보내지 않았다)" -f $label)
    }
  }
  # 0-4. 창 좌표를 물리 픽셀로 읽는다(팔레트 창 크기 비교). 시험 창을 만들기 전에 부른다
  $r.info_dpi = DpiAware
  # 확인 화면이 사용자의 클립보드 글 대신 가짜 글을 보이게(t23-run.ps1이 시작 전 글자 내용을 되돌린다)
  [System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')
  # 시험 창(NewTestForm과 같은 모양, 시스템 메뉴 없음). 이때 앞 창은 사용자의 창이므로 Alt를 누르지 않고 가져온다
  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'SureMate-Test'; $form.ControlBox = $false; $form.Width = 420; $form.Height = 200; $form.StartPosition = 'CenterScreen'
  $form.Show(); Pump 300
  if (-not (FocusTestWindow)) { throw ("시험 창을 앞으로 가져오지 못했다(앞 창 프로세스 '{0}')" -f (ProcName (FgNow).pid)) }

  # a. 프롬프트: 'Ttree 기록으로 주간보고 써줘' → Enter → palette.run prompt:ttree-worklog → 앱이 팔레트를 숨기고 시험 창에서 고른 글을 가져온 뒤
  #    확인 화면(palette.show mode confirm)과 prompt.prepare(templateId ttree-worklog). 확인하지 않고 Esc로만 닫는다(prompt.run 없음)
  try {
    $o = Ask $S.prompt
    $mark = LogMark
    if (-not $o -or -not (PickTop $o)) { $r.prompt_top = "skipped ($script:why)"; ClosePalette }
    else {
      $run = WaitLog $mark 'palette.run' { $true } 3000
      $prep = WaitLog $mark 'prompt.prepare' { $true } 8000
      $confirm = WaitLog $mark 'palette.show' { $_.mode -eq 'confirm' } 1500
      $r.prompt_top = ($null -ne $run -and $run.id -eq 'prompt:ttree-worklog')
      $r.prompt_confirm = ($null -ne $prep -and $prep.templateId -eq 'ttree-worklog' -and $null -ne $confirm)
      $r.info_prompt = 'ran={0} prepare_template={1} capture_skipped={2} confirm_shown={3}' -f (RunText $run), $(if ($prep) { $prep.templateId } else { 'none' }), $(if ($prep) { $prep.skipped } else { '' }), ($null -ne $confirm)
      $opened = @(LogsAfter $mark 'apps.open')
      if ($opened.Count -gt 0) {
        # 맨 위가 프롬프트가 아니라 앱 열기였다. 그 앱 창이 앞에 있을 수 있으므로 여기서 멈춘다
        $script:abort = "step a's Enter opened an app (apps.open app {0}) instead of the prompt; no key was sent from then on" -f $opened[-1].app
      } else {
        # 프롬프트를 골랐는데 확인 화면이 아직 없으면 더 기다린다(늦게 뜬 확인 화면이 다음 단계의 팔레트를 덮지 않게)
        if ((RunText $run).StartsWith('prompt:') -and -not $confirm) { [void](WaitLog $mark 'palette.show' { $_.mode -eq 'confirm' } 5000) }
        Pump 500
        ClosePalette
        Pump 300
      }
      $r.prompt_not_confirmed = (@(LogsAfter $mark 'prompt.run').Count -eq 0)
    }
  } catch { StepFailed 'prompt_top' 'error_a_prompt' $_ }

  # b. Ttree: '휴가 신청' → Enter → 12초 안에 apps.open(ttree)과 앞 창 프로세스 ttree → 그 Ttree 창만 최소화(ShowWindowAsync SW_MINIMIZE, 닫지 않음)해
  #    시작 전 화면으로 돌려 둔다. 최소화하면 Windows가 다음 창(시험 창)을 앞으로 가져온다
  try {
    if ($script:abort) { $r.ttree_top = 'skipped (aborted: see aborted)' }
    elseif (-not $installed.ttree) { $r.ttree_top = 'skipped (Ttree is not installed: the palette has no Ttree command)' }
    else {
      $o = Ask $S.ttree
      $mark = LogMark
      if (-not $o -or -not (PickTop $o)) { $r.ttree_top = "skipped ($script:why)"; ClosePalette }
      else {
        $appStepRan = $true
        $run = WaitLog $mark 'palette.run' { $true } 3000
        $open = WaitLog $mark 'apps.open' { $true } 12000
        $front = WaitFgProcess 'ttree' 1500
        $r.ttree_top = ($null -ne $run -and $run.id -eq 'cmd.open-ttree')
        $r.ttree_opened = ($null -ne $open -and $open.app -eq 'ttree' -and $openOk -contains [string]$open.result)
        $r.ttree_foreground = ($front.process -eq 'ttree')
        $r.info_ttree = 'ran={0} {1} foreground_process={2}' -f (RunText $run), (OpenText $open), $front.process
        if ($open -and $open.app -ne 'ttree') {
          $script:abort = "step b's Enter opened '{0}' instead of Ttree; no key was sent from then on" -f $open.app
        } elseif ($front.process -eq 'ttree') {
          [void][T23W]::ShowWindowAsync($front.hwnd, 6)
          $min = $false; $until = (Get-Date).AddMilliseconds(2000)
          do { Pump 100; $min = [T23W]::IsIconic($front.hwnd) } while (-not $min -and (Get-Date) -lt $until)
          $r.info_ttree_minimized = $min
          Pump 500
        } else {
          $r.info_ttree_minimized = "skipped (the foreground window is not Ttree's)"
          # 팔레트가 남아 있으면(명령이 실행되지 않았거나 다른 화면) Esc로 닫는다
          ClosePalette
        }
      }
    }
  } catch { StepFailed 'ttree_top' 'error_b_ttree' $_ }

  # b2. 이석 미리 알림 미리 보기(개발 명령 dev.awayPreview): '이석 알림' → Enter → away.preview(via pet) → 펫 창만 찍는다
  #     (미리 알림 문구 0.8초, 초 세기 3.4초·4.4초 무렵). 실제 입력 없는 시간·Ttree와는 상관없다
  try {
    $o = Ask '이석 알림'
    $mark = LogMark
    if (-not $o -or -not (PickTop $o)) { $r.away_preview = "skipped ($script:why)"; ClosePalette }
    else {
      $run = WaitLog $mark 'palette.run' { $true } 3000
      $pv = WaitLog $mark 'away.preview' { $true } 3000
      $r.away_preview = ($null -ne $run -and $run.id -eq 'dev.awayPreview' -and $null -ne $pv -and $pv.via -eq 'pet')
      $scale = [double]$o.show.scale
      $shots = @()
      Pump 800
      $pet = PetWindowRect $scale
      if ($pet) {
        foreach ($step in @(@{ name = 't23-away-1-warning'; wait = 0 }, @{ name = 't23-away-2-countdown'; wait = 2600 }, @{ name = 't23-away-3-countdown'; wait = 1000 })) {
          if ($step.wait -gt 0) { Pump $step.wait }
          CaptureRect $step.name $pet $scale
          $shots += $step.name
        }
      }
      $r.info_away = 'ran={0} via={1} pet_window={2} shots={3}' -f (RunText $run), $(if ($pv) { $pv.via } else { 'none' }), ($null -ne $pet), ($shots -join ',')
      Pump 3000
    }
  } catch { StepFailed 'away_preview' 'error_b2_away' $_ }

  # c. 메신저(마지막): '메신저 열어줘' → Enter → 12초 안에 apps.open(messenger)과 앞 창 프로세스 SURESOFTMessenger.
  #    Enter를 뗀 뒤로는 키를 보내지 않는다(팔레트가 남아 있어도 닫지 않는다: run-smoke.ps1이 앱을 끝낸다)
  try {
    if ($script:abort) { $r.messenger_top = 'skipped (aborted: see aborted)' }
    elseif (-not $installed.messenger) { $r.messenger_top = 'skipped (the messenger is not installed: the palette has no messenger command)' }
    else {
      $o = Ask $S.messenger
      $mark = LogMark
      if (-not $o -or -not (PickTop $o)) { $r.messenger_top = "skipped ($script:why)"; ClosePalette }
      else {
        $keysAtMessenger = $script:keys
        $appStepRan = $true
        $run = WaitLog $mark 'palette.run' { $true } 3000
        $open = WaitLog $mark 'apps.open' { $true } 12000
        $front = WaitFgProcess 'SURESOFTMessenger' 1500
        $r.messenger_top = ($null -ne $run -and $run.id -eq 'cmd.open-messenger')
        $r.messenger_opened = ($null -ne $open -and $open.app -eq 'messenger' -and $openOk -contains [string]$open.result)
        $r.messenger_foreground = ($front.process -eq 'SURESOFTMessenger')
        $r.info_messenger = 'ran={0} {1} foreground_process={2}' -f (RunText $run), (OpenText $open), $front.process
      }
    }
  } catch { StepFailed 'messenger_top' 'error_c_messenger' $_ }

  # 여기부터 키 없음. 앱이 다시 연 실행 파일이 dev 앱의 자식으로 남았는지(한 번만 실행되는 앱이면 곧 끝난다)
  if ($appStepRan) {
    $copies = @(); $until = (Get-Date).AddMilliseconds(6000)
    do {
      $copies = @(CopiesUnderApp 'ttree.exe') + @(CopiesUnderApp 'SURESOFTMessenger.exe')
      if ($copies.Count -eq 0) { break }
      Pump 500
    } while ((Get-Date) -lt $until)
    if ($copies.Count -gt 0) { $r.warning_copies_left = '{0} ttree/messenger process(es) started by Sure-Mate are still children of the dev app; run-smoke.ps1 cleanup (taskkill /T) will end them' -f $copies.Count }
    else { $r.info_copies_left = 0 }
  }
  $r.no_keys_after_messenger = if ($null -ne $keysAtMessenger) { ($script:keys -eq $keysAtMessenger) } else { 'skipped (the messenger step did not press Enter)' }

  # 로그에 입력 문장이 없다(id·결과·길이만). 문장이 팔레트에 들어가지 않았거나 이번 실행의 palette.run 줄이 없으면 판정하지 않는다(t22와 같다)
  $appLines = @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $startLines) -join "`n"
  if ($script:typed -eq 0) {
    $r.log_has_no_phrases = 'skipped (no sentence reached the palette)'
    $r.log_has_no_typed_text = 'skipped (no sentence reached the palette)'
  } elseif (@(NewLogs 'palette.run').Count -eq 0) {
    $r.log_has_no_phrases = 'skipped (no app log lines)'
    $r.log_has_no_typed_text = 'skipped (no app log lines)'
  } else {
    $found = @($phrases | Where-Object { $appLines.Contains($_) })
    $r.log_has_no_phrases = ($found.Count -eq 0)
    if ($found.Count -gt 0) { $r.info_phrases_in_log = $found -join ', ' }
    $r.log_has_no_typed_text = -not ($appLines -match $typedKeyPattern)
    $r.info_sentences_typed = '{0} of 3' -f $script:typed
  }
} catch {
  if (-not $script:abort) { $r.error = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }
} finally {
  if ($script:abort) { $r.aborted = $script:abort }
  if ($script:held.Count -gt 0) { $r.warning_keys_held = 'pressed but not released when the test stopped: {0} (press and release each once)' -f ((@($script:held.Keys) | ForEach-Object { '0x{0:X2}' -f $_ }) -join ', ') }
  $r.info_keys_sent = $script:keys
  # 시험 창만 닫는다(메신저·Ttree 창은 건드리지 않는다)
  if ($form) { try { $form.Close() } catch { } }
  $r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
}
