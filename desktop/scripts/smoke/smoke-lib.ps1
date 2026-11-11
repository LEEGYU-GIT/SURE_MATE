# shared helpers for smoke tests (dot-source this)
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public static string Title(IntPtr h){ var sb=new StringBuilder(256); GetWindowText(h,sb,256); return sb.ToString(); }
  public static uint Pid(IntPtr h){ uint p; GetWindowThreadProcessId(h, out p); return p; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  // 화면 사각형(물리 픽셀)과 겹치는 창 가운데 z 순서 맨 위의 topmost 창. 숨김·DWM 가림(cloaked)·클릭 통과(WS_EX_TRANSPARENT) 창은 건너뛴다
  public static IntPtr TopmostOver(int x, int y, int w, int h) {
    for (IntPtr c = GetTopWindow(IntPtr.Zero); c != IntPtr.Zero; c = GetWindow(c, 2)) {
      if (!IsWindowVisible(c)) continue;
      int ex = GetWindowLong(c, -20);
      if ((ex & 0x8) == 0) continue;
      if ((ex & 0x20) != 0) continue;
      int cloaked; if (DwmGetWindowAttribute(c, 14, out cloaked, 4) == 0 && cloaked != 0) continue;
      RECT r; if (!GetWindowRect(c, out r)) continue;
      if (r.Right <= r.Left || r.Bottom <= r.Top) continue;
      if (r.Right <= x || r.Left >= x + w || r.Bottom <= y || r.Top >= y + h) continue;
      return c;
    }
    return IntPtr.Zero;
  }
}
"@
# 좌표는 물리 픽셀로 다룬다(앱 로그의 DIP × 배율). 창·캡처·커서가 같은 좌표계를 쓰도록 DPI 인식으로 둔다
[void][W]::SetProcessDPIAware()
$VK = @{ 'ctrl' = 0x11; 'alt' = 0x12; 'shift' = 0x10; 'space' = 0x20; ' ' = 0x20; '`' = 0xC0; 'f9' = 0x78; 'esc' = 0x1B; 'f4' = 0x73; 'enter' = 0x0D; 'backspace' = 0x08; 'tab' = 0x09; '/' = 0xBF; '.' = 0xBE; '-' = 0xBD; ',' = 0xBC }
function Key([byte]$vk, [switch]$Up) { $scan = [byte][W]::MapVirtualKey($vk, 0); [W]::keybd_event($vk, $scan, $(if ($Up) { 2 } else { 0 }), [UIntPtr]::Zero) }
function Tap([byte]$vk) { Key $vk; Key $vk -Up }
# 글자·숫자는 문자 코드가 곧 가상 키, 기호(/ . - ,)와 공백은 $VK 표로 바꾼다(US·한국어 자판 같은 자리)
function TypeAscii([string]$s) { foreach ($ch in $s.ToUpper().ToCharArray()) { Tap (VkOf ([string]$ch)); Pump 30 } }
function Pump([int]$ms) { $end = (Get-Date).AddMilliseconds($ms); while ((Get-Date) -lt $end) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 15 } }
function VkOf([string]$k) { if ($VK.ContainsKey($k)) { return $VK[$k] }; if ($k.Length -eq 1) { return [byte][char]$k.ToUpper() }; throw "unknown key: $k" }
function Combo([string]$combo) { $t = $combo.ToLower().Split('+'); $mods = @($t[0..($t.Count-2)] | ForEach-Object { VkOf $_ }); $main = VkOf $t[-1]; foreach ($m in $mods) { Key $m }; Tap $main; foreach ($m in $mods[($mods.Count-1)..0]) { Key $m -Up } }
function Fg { $h = [W]::GetForegroundWindow(); $p = [W]::Pid($h); [pscustomobject]@{ Title = [W]::Title($h); Process = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName } }
$logFile = Join-Path $env:APPDATA ("Sure-Mate\logs\" + (Get-Date -Format 'yyyy-MM-dd') + ".log")
$startLines = if (Test-Path $logFile) { @(Get-Content $logFile).Count } else { 0 }
function NewLogs([string]$eventName) { @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $startLines | Where-Object { $_ -match "`"event`":`"$eventName`"" }) }
function NewTestForm {
  $f = New-Object System.Windows.Forms.Form
  $f.Text = 'SureMate-Test'; $f.ControlBox = $false; $f.Width = 420; $f.Height = 200; $f.StartPosition = 'CenterScreen'
  $f.Show(); Pump 300
  Key 0x12; [void][W]::SetForegroundWindow($f.Handle); Key 0x12 -Up; $f.Activate(); Pump 400
  return $f
}
function IsApp { $p = (Fg).Process; return ($p -eq 'electron' -or $p -eq 'Sure-Mate') }

# ---- M5 바·펼침 창(t18) ----
# 로그 한 줄씩 JSON으로. Mark 뒤의 줄만 본다(LogMark → 동작 → LogsAfter/WaitLog)
function LogMark { if (Test-Path $logFile) { @(Get-Content $logFile -Encoding UTF8).Count } else { 0 } }
function LogsAfter([int]$mark, [string]$eventName) {
  @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $mark | Where-Object { $_ -match "`"event`":`"$([regex]::Escape($eventName))`"" } | ForEach-Object { $_ | ConvertFrom-Json })
}
# 조건에 맞는 줄이 생길 때까지 기다린다(없으면 $null). 기다리는 동안 시험 창 메시지를 처리한다
function WaitLog([int]$mark, [string]$eventName, [scriptblock]$where, [int]$timeoutMs) {
  $end = (Get-Date).AddMilliseconds($timeoutMs)
  do {
    $hit = @(LogsAfter $mark $eventName | Where-Object $where)
    if ($hit.Count -gt 0) { return $hit[-1] }
    Pump 40
  } while ((Get-Date) -lt $end)
  return $null
}
# 이번 앱 실행(마지막 app.ready 뒤)의 줄. 앱이 시험 스크립트보다 먼저 남긴 바 배치를 읽을 때 쓴다
function SinceAppReady([string]$eventName) {
  $lines = @(Get-Content $logFile -Encoding UTF8)
  $ready = -1
  for ($i = $lines.Count - 1; $i -ge 0; $i--) { if ($lines[$i] -match '"event":"app.ready"') { $ready = $i; break } }
  @($lines | Select-Object -Skip ($ready + 1) | Where-Object { $_ -match "`"event`":`"$([regex]::Escape($eventName))`"" } | ForEach-Object { $_ | ConvertFrom-Json })
}
function LastBarPlace { SinceAppReady 'bar.place' | Select-Object -Last 1 }

# 바 항목의 바 안쪽 세로 위치(DIP). BAR_METRICS(띠: 위 여백 8·칸 40 / 캡슐: 12·36, 간격 4, 구분선 12)와 항목 순서
# (로고, 가명 처리 | 고정 프롬프트 | 워크스페이스, 용어 사전 | 펫, 설정)를 따른다. 구분선은 sep1·sep2·sep3
function BarLayout([int]$itemCount, [string]$shape = 'edge') {
  $cell = if ($shape -eq 'capsule') { 36 } else { 40 }
  $y = if ($shape -eq 'capsule') { 12 } else { 8 }
  $prompts = if ($itemCount -le 8) { 0 } else { $itemCount - 9 }
  $order = @('logo', 'masking')
  if ($prompts -gt 0) { $order += @('|') + @(1..$prompts | ForEach-Object { "prompt$_" }) }
  $order += @('|', 'workspace', 'glossary', '|', 'pet', 'settings')
  $out = @{}; $sep = 0
  foreach ($id in $order) {
    $h = if ($id -eq '|') { 12 } else { $cell }
    $name = if ($id -eq '|') { $sep++; "sep$sep" } else { $id }
    $out[$name] = [pscustomobject]@{ top = $y; center = $y + $h / 2 }
    $y += $h + 4
  }
  # 이 계산이 앱 로그의 바 높이와 같은지 확인하는 값: 위아래 여백 + 칸 높이 합 + 간격(마지막 간격 제외)
  $out['_height'] = $y - 4 + $(if ($shape -eq 'capsule') { 12 } else { 8 })
  return $out
}
# 바 항목(또는 구분선) 가운데의 물리 픽셀
function BarPointPx($place, [string]$item) {
  $l = BarLayout $place.items $place.shape
  $s = [double]$place.scale; $b = $place.bounds
  [pscustomobject]@{ x = [int][Math]::Round(($b.x + $b.width / 2) * $s); y = [int][Math]::Round(($b.y + $l[$item].center) * $s) }
}
# 메뉴 펼침 창의 카드 사각형(DIP). 오른쪽 바면 창 오른쪽 끝이 카드 끝이고(바 쪽 그림자 여백 0), 위 그림자 여백은 16
function MenuCard($bounds, [int]$width = 272) {
  [pscustomobject]@{ x = $bounds.x + $bounds.width - $width; y = $bounds.y + 16; width = $width }
}
function MoveTo([int]$x, [int]$y) { [void][W]::SetCursorPos($x, $y); [W]::mouse_event(0x0001, 0, 0, 0, [UIntPtr]::Zero) }
function HoverAt([int]$x, [int]$y) { MoveTo $x $y }
# 올린 시간을 정확히 재야 할 때: 목표에서 250픽셀 먼 곳으로 옮겨 가라앉힌 뒤(시간 재지 않음) 한 번에 들어가고, 들어간 시각을 돌려준다.
# 들어가는 이동은 HoverAt과 같은 MoveTo다(마우스 이동 메시지가 확실히 가야 올림이 잡힌다)
function HoverEnter([int]$x, [int]$y) {
  MoveTo ($x - 250) $y; Pump 300
  $t = Get-Date
  MoveTo $x $y
  return $t
}
function ElapsedMs($t) { return [int]((Get-Date) - $t).TotalMilliseconds }
# 같은 자리를 0.7초 안에 다시 누르면 앱은 운영 체제의 두 번 클릭으로 보고 두 번째를 무시한다(바 단추, 최종 검토 I2).
# 시험이 그 두 번째를 잃지 않도록 같은 자리 연속 클릭 사이를 0.7초 이상 띄운다
$script:lastClick = [pscustomobject]@{ x = -9999; y = -9999; at = (Get-Date).AddHours(-1) }
# 사람처럼: 옮기고 잠깐 쉬었다 누르고 0.09초 뒤 뗀다
function ClickAt([int]$x, [int]$y, [switch]$Right) {
  $gap = 700 - [int]((Get-Date) - $script:lastClick.at).TotalMilliseconds
  if ($gap -gt 0 -and [Math]::Abs($x - $script:lastClick.x) -le 8 -and [Math]::Abs($y - $script:lastClick.y) -le 8) { Pump $gap }
  MoveTo $x $y; Pump 120
  $down = if ($Right) { 0x0008 } else { 0x0002 }
  $up = if ($Right) { 0x0010 } else { 0x0004 }
  [W]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero); Pump 90
  [W]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  $script:lastClick = [pscustomobject]@{ x = $x; y = $y; at = (Get-Date) }
}
# 누른 채 세로로 dy 픽셀 끌기(여러 번 나눠 움직인다)
function DragBy([int]$x, [int]$y, [int]$dy, [int]$steps = 15) {
  MoveTo $x $y; Pump 120
  [W]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Pump 150
  for ($i = 1; $i -le $steps; $i++) { MoveTo $x ($y + [int][Math]::Round($dy * $i / $steps)); Pump 30 }
  Pump 150
  [W]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}
# 화면 사각형(DIP)을 배율로 바꿔 %TEMP%\sure-mate-smoke\<이름>.png로 저장
function ShotRect([string]$name, $rect, [double]$scale) {
  Add-Type -AssemblyName System.Drawing
  $dir = Join-Path $env:TEMP 'sure-mate-smoke'; New-Item -ItemType Directory -Force $dir | Out-Null
  $x = [int][Math]::Round($rect.x * $scale); $y = [int][Math]::Round($rect.y * $scale)
  $w = [int][Math]::Round($rect.width * $scale); $h = [int][Math]::Round($rect.height * $scale)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size $w, $h))
  $path = Join-Path $dir "$name.png"; $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
  "$name = $path ($w x $h)"
}
# 바 사각형과 겹치는 맨 위 topmost 창이 Sure-Mate인지(다른 topmost 창이 바를 덮지 않았는지). 이름은 참고용
function TopmostOverBar($place) {
  $s = [double]$place.scale; $b = $place.bounds
  $h = [W]::TopmostOver([int]($b.x * $s), [int]($b.y * $s), [int]($b.width * $s), [int]($b.height * $s))
  if ($h -eq [IntPtr]::Zero) { return '' }
  (Get-Process -Id ([W]::Pid($h)) -ErrorAction SilentlyContinue).ProcessName
}
function TopmostIsApp($place) { $n = TopmostOverBar $place; return ($n -eq 'electron' -or $n -eq 'Sure-Mate') }
# 마지막 palette.show 로그의 위치(DIP×배율)로 팔레트 화면을 %TEMP%\sure-mate-smoke\<이름>.png로 저장
function Shot([string]$name) {
  Add-Type -AssemblyName System.Drawing
  $dir = Join-Path $env:TEMP 'sure-mate-smoke'; New-Item -ItemType Directory -Force $dir | Out-Null
  $show = NewLogs 'palette.show' | Select-Object -Last 1 | ConvertFrom-Json
  $s = [double]$show.scale; $b = $show.bounds
  $w = [int]($b.width * $s); $h = [int]($b.height * $s)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen([int]($b.x * $s), [int]($b.y * $s), 0, 0, (New-Object System.Drawing.Size $w, $h))
  $path = Join-Path $dir "$name.png"; $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
  "$name = $path ($w x $h)"
}

# ---- M6 말랑 메이트(t20) ----
# 앱 프로세스 찾기용: dev 앱의 electron은 이 저장소의 desktop 폴더 것만, 설치본은 Sure-Mate
$script:desktopDir = (Resolve-Path "$PSScriptRoot\..\..").Path
# 로그 줄의 시각(t, ISO 8601 UTC)을 DateTime(UTC)으로. PowerShell 5.1은 문자열, 7은 DateTime으로 읽는다
function LogTime($ev) {
  $t = $ev.t
  if ($t -is [datetime]) { return $t.ToUniversalTime() }
  return [DateTime]::Parse([string]$t, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
}
# 마지막 app.ready 줄 바로 다음 줄 번호(LogsAfter·WaitLog의 mark로 쓴다)와 그 줄의 시각
function ReadyMark {
  $lines = @(Get-Content $logFile -Encoding UTF8)
  for ($i = $lines.Count - 1; $i -ge 0; $i--) { if ($lines[$i] -match '"event":"app.ready"') { return ($i + 1) } }
  return 0
}
function ReadyTime {
  $lines = @(Get-Content $logFile -Encoding UTF8)
  for ($i = $lines.Count - 1; $i -ge 0; $i--) { if ($lines[$i] -match '"event":"app.ready"') { return (LogTime ($lines[$i] | ConvertFrom-Json)) } }
  return $null
}
# 이번 앱 실행의 마지막 pet.state 줄(mode를 주면 그 mode만). mode: climb·sit·sleep·wake·held·land. box·window는 화면 DIP
function LastPet([string]$mode = '') {
  $all = @(SinceAppReady 'pet.state')
  if ($mode -ne '') { $all = @($all | Where-Object { $_.mode -eq $mode }) }
  if ($all.Count -eq 0) { return $null }
  return $all[-1]
}
# 펫 몸 상자(box)의 가운데(DIP)
function PetCenter($pet) {
  if (-not $pet -or -not $pet.box) { throw '펫 자리를 알 수 없다(보이지 않거나, 움직이는 중이라 로그에 없는 자리여서 어림하지 않았다)' }
  [pscustomobject]@{ x = $pet.box.x + $pet.box.width / 2; y = $pet.box.y + $pet.box.height / 2 }
}
# 지금 화면에 보이는 펫 창(320x240 DIP)의 사각형(DIP). 숨었으면 $null. 펫 창은 크기가 고정이라 크기로 찾는다
function PetWindowRect([double]$scale) {
  $tw = 320 * $scale; $th = 240 * $scale; $names = @{}
  for ($c = [W]::GetTopWindow([IntPtr]::Zero); $c -ne [IntPtr]::Zero; $c = [W]::GetWindow($c, 2)) {
    if (-not [W]::IsWindowVisible($c)) { continue }
    $r = New-Object 'W+RECT'
    if (-not [W]::GetWindowRect($c, [ref]$r)) { continue }
    if ([Math]::Abs(($r.Right - $r.Left) - $tw) -gt 3 -or [Math]::Abs(($r.Bottom - $r.Top) - $th) -gt 3) { continue }
    $id = [int][W]::Pid($c)
    if (-not $names.ContainsKey($id)) { $names[$id] = (Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName }
    if ($names[$id] -ne 'electron' -and $names[$id] -ne 'Sure-Mate') { continue }
    return [pscustomobject]@{ x = $r.Left / $scale; y = $r.Top / $scale; width = ($r.Right - $r.Left) / $scale; height = ($r.Bottom - $r.Top) / $scale }
  }
  return $null
}
# 펫의 지금 자리. 창 사각형이 마지막 pet.state의 window와 같으면 그 줄의 box(정확), 아니면 창 아래 가운데로 어림한다
# (창이 화면 가장자리에 닿으면 어림하지 않는다). 보이지 않거나 알 수 없으면 $null
function PetNow([double]$scale, [int]$size = 56) {
  $win = PetWindowRect $scale
  if (-not $win) { return $null }
  $last = LastPet
  $exact = $false
  $box = $null
  if ($last -and $last.window -and [Math]::Abs($last.window.x - $win.x) -le 2 -and [Math]::Abs($last.window.y - $win.y) -le 2) { $box = $last.box; $exact = $true }
  if (-not $box) {
    # 로그에 없는 자리는 창이 화면 가장자리에 눌리지 않았을 때만 어림한다(눌린 창은 펫이 창 가운데가 아니라 약 130 DIP 어긋난다)
    $sc = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $touch = ($win.x * $scale -lt $sc.Left + 3 -or ($win.x + $win.width) * $scale -gt $sc.Right - 3 -or $win.y * $scale -lt $sc.Top + 3 -or ($win.y + $win.height) * $scale -gt $sc.Bottom - 3)
    if ($touch) { return $null }
    $box = [pscustomobject]@{ x = $win.x + $win.width / 2 - $size / 2; y = $win.y + $win.height - $size; width = $size; height = $size }
  }
  [pscustomobject]@{ box = $box; window = $win; exact = $exact }
}
# 펫 창이 stableMs 동안 움직이지 않을 때까지 기다려 지금 자리를 돌려준다(시간 안에 안 서면 $null)
function WaitPetStill([double]$scale, [int]$stableMs = 500, [int]$timeoutMs = 25000, [int]$size = 56) {
  $end = (Get-Date).AddMilliseconds($timeoutMs)
  $prev = $null; $since = Get-Date
  do {
    $w = PetWindowRect $scale
    if ($w) {
      if ($prev -and [Math]::Abs($w.x - $prev.x) -lt 0.6 -and [Math]::Abs($w.y - $prev.y) -lt 0.6) {
        if (((Get-Date) - $since).TotalMilliseconds -ge $stableMs) { return (PetNow $scale $size) }
      } else { $prev = $w; $since = Get-Date }
    } else { $prev = $null }
    Pump 60
  } while ((Get-Date) -lt $end)
  return $null
}
# 오른쪽 클릭 메뉴 사각형(DIP). main의 menuSlot과 같은 규칙: 4행(조종하기·재우기/깨우기·숨기기·펫 설정), 너비 176, 행 32, 안쪽 여백 4,
# 위쪽 자리가 있으면 펫 상자 위, 아니면 여유가 큰 옆. 창 가장자리 여백은 위 16·옆 24·아래 32. bounds는 모니터 전체 사각형(DIP)
function PetMenuRect($box, $win, $bounds, [int]$rows = 4) {
  $w = 176; $h = $rows * 32 + 8
  $xLo = $win.x + 24; $xHi = $win.x + $win.width - 24 - $w
  $ay = $box.y - 8 - $h
  if ($ay -ge ($win.y + 16) -and $ay -ge ($bounds.y + 16)) {
    $x = [Math]::Min([Math]::Max($box.x + $box.width / 2 - $w / 2, $xLo), $xHi)
    return [pscustomobject]@{ x = $x; y = $ay; width = $w; height = $h; side = 'above' }
  }
  $left = (($box.x - $win.x) -gt ($win.x + $win.width - ($box.x + $box.width)))
  $x = if ($left) { $box.x - 8 - $w } else { $box.x + $box.width + 8 }
  $y = [Math]::Min([Math]::Max($box.y + $box.height / 2 - $h / 2, $win.y + 16), $win.y + $win.height - 32 - $h)
  $x = [Math]::Min([Math]::Max($x, $xLo), $xHi)
  [pscustomobject]@{ x = $x; y = $y; width = $w; height = $h; side = $(if ($left) { 'left' } else { 'right' }) }
}
# 메뉴 행(0부터)의 가운데(DIP)
function PetMenuRowPoint($menu, [int]$row) {
  [pscustomobject]@{ x = $menu.x + $menu.width / 2; y = $menu.y + 4 + 32 * $row + 16 }
}
# 방향키는 확장 키(extended)로 보내야 KeyboardEvent.code가 ArrowLeft 등이 된다(없으면 Numpad 코드가 된다). 스캔 코드도 함께 보낸다
function ExtKey([byte]$vk, [switch]$Up) {
  $scan = [byte][W]::MapVirtualKey($vk, 0)
  [W]::keybd_event($vk, $scan, $(if ($Up) { 3 } else { 1 }), [UIntPtr]::Zero)
}
# fromDip에서 누르고(0.15초 쉼) ms 동안 16ms 간격으로 toDip까지 끈 뒤, holdMs만큼 멈췄다가 뗀다(holdMs 0이면 움직이는 중에 뗀다).
# 좌표는 DIP, 마우스는 물리 픽셀(DIP × 배율). 뗀 시각(Get-Date)을 돌려준다
function DragPath($fromDip, $toDip, [int]$ms, [double]$scale = 1, [int]$holdMs = 0) {
  $fx = [int][Math]::Round($fromDip.x * $scale); $fy = [int][Math]::Round($fromDip.y * $scale)
  $tx = [int][Math]::Round($toDip.x * $scale); $ty = [int][Math]::Round($toDip.y * $scale)
  MoveTo $fx $fy; Pump 350
  [W]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Pump 150
  $n = [Math]::Max(1, [int]($ms / 16))
  for ($i = 1; $i -le $n; $i++) {
    MoveTo ($fx + [int][Math]::Round(($tx - $fx) * $i / $n)) ($fy + [int][Math]::Round(($ty - $fy) * $i / $n))
    Start-Sleep -Milliseconds 16
  }
  if ($holdMs -gt 0) { Pump $holdMs }
  [W]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  return (Get-Date)
}
# Sure-Mate 프로세스(dev 앱의 electron은 이 저장소 것만, 설치본은 Sure-Mate)
function AppProcs {
  @(Get-Process -ErrorAction SilentlyContinue | Where-Object { ($_.ProcessName -eq 'electron' -and $_.Path -like "$script:desktopDir*") -or $_.ProcessName -eq 'Sure-Mate' })
}
# 앱 프로세스 CPU 초의 합
function CpuSeconds {
  $sum = 0.0
  foreach ($p in (AppProcs)) { try { $sum += $p.TotalProcessorTime.TotalSeconds } catch { } }
  return $sum
}
# 앞 창이 펫 창(320x240 DIP, 앱 프로세스)인지. 조종 중 포커스를 가져간 펫 창과 팔레트 같은 다른 앱 창을 구분한다
function ForegroundIsPetWindow([double]$scale) {
  $h = [W]::GetForegroundWindow()
  $r = New-Object 'W+RECT'
  if (-not [W]::GetWindowRect($h, [ref]$r)) { return $false }
  if ([Math]::Abs(($r.Right - $r.Left) - 320 * $scale) -gt 3 -or [Math]::Abs(($r.Bottom - $r.Top) - 240 * $scale) -gt 3) { return $false }
  $id = [int][W]::Pid($h)
  return (@(AppProcs | Where-Object { $_.Id -eq $id }).Count -gt 0)
}

# ---- M7 워크스페이스·말하듯 입력(t21·t22) ----
# 새 Win32 선언(M7W)은 따로 컴파일한다. 컴파일에 실패해도 위의 도우미(t5~t20)는 그대로 동작하고, 아래 M7 도우미만 까닭과 함께 멈춘다
Add-Type -AssemblyName System.Drawing
$script:m7TypeError = $null
try {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class M7W {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
  [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  // 글자 하나를 KEYEVENTF_UNICODE(0x4)로 누르고 뗀다(VK_PACKET이라 한글 IME 조합을 거치지 않는다). 보낸 입력 수(2면 성공)
  public static uint UnicodeChar(char c) {
    INPUT[] a = new INPUT[2];
    a[0].type = 1; a[0].u.ki.wScan = c; a[0].u.ki.dwFlags = 0x0004;
    a[1].type = 1; a[1].u.ki.wScan = c; a[1].u.ki.dwFlags = 0x0006;
    return SendInput(2, a, Marshal.SizeOf(typeof(INPUT)));
  }
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT value, int size);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int width, int height, uint flags);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct MONITORINFOEX { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFOEX info);
  [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr monitor, int type, out uint dpiX, out uint dpiY);
  public delegate bool MonitorEnumProc(IntPtr monitor, IntPtr hdc, IntPtr rect, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc proc, IntPtr data);
  public class Display { public string Device; public bool Primary; public int X; public int Y; public int Width; public int Height; public int WorkX; public int WorkY; public int WorkWidth; public int WorkHeight; public uint Dpi; }
  // 모니터마다 영역·작업 영역(부른 스레드의 DPI 인식 기준 좌표)과 유효 DPI(읽지 못하면 96)
  public static List<Display> Displays() {
    List<Display> list = new List<Display>();
    MonitorEnumProc proc = delegate (IntPtr m, IntPtr hdc, IntPtr rect, IntPtr data) {
      MONITORINFOEX info = new MONITORINFOEX();
      info.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
      if (!GetMonitorInfo(m, ref info)) return true;
      uint dx = 96, dy = 96;
      try { if (GetDpiForMonitor(m, 0, out dx, out dy) != 0) dx = 96; } catch (Exception) { dx = 96; }
      Display d = new Display();
      d.Device = info.szDevice;
      d.Primary = (info.dwFlags & 1) != 0;
      d.X = info.rcMonitor.Left; d.Y = info.rcMonitor.Top;
      d.Width = info.rcMonitor.Right - info.rcMonitor.Left; d.Height = info.rcMonitor.Bottom - info.rcMonitor.Top;
      d.WorkX = info.rcWork.Left; d.WorkY = info.rcWork.Top;
      d.WorkWidth = info.rcWork.Right - info.rcWork.Left; d.WorkHeight = info.rcWork.Bottom - info.rcWork.Top;
      d.Dpi = dx;
      list.Add(d);
      return true;
    };
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, proc, IntPtr.Zero);
    GC.KeepAlive(proc);
    return list;
  }
}
'@
} catch { $script:m7TypeError = "$_" }
function M7Ready { if ($script:m7TypeError) { throw "M7 도우미(M7W)를 컴파일하지 못했다: $script:m7TypeError" } }

# 배율이 다른 모니터에서도 창 좌표·모니터 영역을 물리 픽셀로 읽도록 이 스레드를 모니터별 DPI 인식 v2(-4)로 바꾼다.
# 스크립트 시작 직후(시험 창을 만들거나 Screen을 읽기 전에) 부른다. 이 파일을 불러올 때 프로세스를 시스템 DPI 인식으로 정했으므로
# (프로세스의 DPI 인식은 한 번만 정할 수 있다) SetProcessDpiAwarenessContext(-4)는 대개 실패하고 SetThreadDpiAwarenessContext(-4)로 바꾼다.
# 돌려주는 값: 'per-monitor-v2 (process)' · 'per-monitor-v2 (thread)' · 'system'(바꾸지 못함: 배율이 다른 모니터의 좌표가 어긋날 수 있다)
function DpiAware {
  M7Ready
  try { if ([M7W]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))) { return 'per-monitor-v2 (process)' } } catch { }
  try { if ([M7W]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) -ne [IntPtr]::Zero) { return 'per-monitor-v2 (thread)' } } catch { }
  return 'system'
}
# 창을 물리 좌표(창 사각형: 보이지 않는 크기 조절 테두리 포함)로 옮긴다. SetWindowPos라 z-순서와 활성 창은 그대로다.
# 폼 또는 HWND(IntPtr)를 받는다. 최대화·최소화한 창은 먼저 SetFormState로 보통 상태로 둔다
function MoveForm($form, [int]$x, [int]$y, [int]$w, [int]$h) {
  M7Ready
  $hw = if ($form -is [IntPtr]) { $form } else { $form.Handle }
  if (-not [M7W]::SetWindowPos($hw, [IntPtr]::Zero, $x, $y, $w, $h, 0x0014)) { throw "MoveForm: SetWindowPos 실패(오류 $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))" }
  Pump 200
}
# 시험 창(제목, 물리 좌표 x·y·너비·높이). StartPosition Manual, 시스템 메뉴 없음(ControlBox 끔: Alt 단독 입력의 메뉴 모드 방지).
# WinForms가 배율에 맞춰 크기를 바꿀 수 있으므로 보인 뒤 MoveForm으로 다시 놓는다. 앞 창이 되는지는 Windows 포커스 규칙을 따르므로
# 앞 창이 필요하면 부르는 쪽이 Alt 누름과 SetForegroundWindow로 가져온다(NewTestForm과 같은 방법)
function NewWinForm([string]$title, [int]$x, [int]$y, [int]$w, [int]$h) {
  M7Ready
  $f = New-Object System.Windows.Forms.Form
  $f.Text = $title; $f.ControlBox = $false; $f.StartPosition = 'Manual'
  $f.Location = New-Object System.Drawing.Point $x, $y
  $f.Size = New-Object System.Drawing.Size $w, $h
  $f.Show(); Pump 200
  MoveForm $f $x $y $w $h
  return $f
}
# 창의 보이는 테두리(DWMWA_EXTENDED_FRAME_BOUNDS, 물리 픽셀). 앱이 창을 읽을 때(native/windows.ts frameRect)와 같은 기준이다.
# 폼 또는 HWND(IntPtr)를 받는다. 읽지 못하면 $null
function FrameOf($form) {
  M7Ready
  $hw = if ($form -is [IntPtr]) { $form } else { $form.Handle }
  $rc = New-Object 'M7W+RECT'
  if ([M7W]::DwmGetWindowAttribute($hw, 9, [ref]$rc, 16) -ne 0) { return $null }
  [pscustomobject]@{ x = $rc.Left; y = $rc.Top; width = $rc.Right - $rc.Left; height = $rc.Bottom - $rc.Top }
}
# 폼 상태를 바꾼다('Normal' · 'Minimized' · 'Maximized', WinForms WindowState). 최소화·최대화 움직임이 끝나도록 0.4초 기다린다
function SetFormState($form, [ValidateSet('Normal', 'Minimized', 'Maximized')][string]$state) {
  $form.WindowState = [System.Windows.Forms.FormWindowState]$state
  Pump 400
}
# 글자만 입력한다: 글자마다 SendInput KEYEVENTF_UNICODE(누름·뗌), 30ms 간격. 한글과 Shift가 필요한 기호(@ 등)도 그대로 들어가며
# IME 조합을 거치지 않는다(한글 IME로 직접 치는 확인은 사람이 한다). Enter·Esc·화살표 같은 명령 키는 Key·TapHuman·ExtTapHuman(스캔 코드)으로 보낸다.
# 앞 창이 관리자 권한 창이면 SendInput이 막혀(UIPI) 예외를 낸다
function TypeUnicode([string]$s) {
  M7Ready
  foreach ($ch in $s.ToCharArray()) {
    if ([M7W]::UnicodeChar($ch) -ne 2) { throw "TypeUnicode: SendInput이 글자를 보내지 못했다(오류 $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))" }
    Pump 30
  }
}
# 모니터마다 영역·작업 영역과 배율(유효 DPI ÷ 96). 좌표는 부른 스레드의 DPI 인식을 따른다(DpiAware 뒤면 물리 픽셀). 주 모니터가 맨 앞이다
function ScreensInfo {
  M7Ready
  @([M7W]::Displays() | Sort-Object { -not $_.Primary } | ForEach-Object {
      [pscustomobject]@{
        device = $_.Device
        primary = $_.Primary
        bounds = [pscustomobject]@{ x = $_.X; y = $_.Y; width = $_.Width; height = $_.Height }
        work = [pscustomobject]@{ x = $_.WorkX; y = $_.WorkY; width = $_.WorkWidth; height = $_.WorkHeight }
        dpi = [int]$_.Dpi
        scale = [Math]::Round($_.Dpi / 96.0, 2)
      }
    })
}
# 사람 손 타이밍 키(t18·t20 안의 같은 이름 함수와 같은 동작). 보조키를 누른 채 키를 누르고, 보조키는 lateMs 늦게 뗀다
function HoldCombo([string]$acc, [int]$lateMs) {
  $t = $acc.ToLower().Split('+'); $mods = @($t[0..($t.Count - 2)] | ForEach-Object { VkOf $_ })
  foreach ($m in $mods) { Key $m; Pump 40 }
  Tap (VkOf $t[-1]); Pump $lateMs
  foreach ($m in $mods[($mods.Count - 1)..0]) { Key $m -Up; Pump 20 }
}
# 키를 0.09초 눌렀다 뗀다(스캔 코드 포함)
function TapHuman([byte]$vk) { Key $vk; Pump 90; Key $vk -Up }
# 확장 키(방향키·Home·End)를 0.09초 눌렀다 뗀다. 확장 플래그가 있어야 KeyboardEvent.code가 ArrowDown·End 등이 된다
function ExtTapHuman([byte]$vk) { ExtKey $vk; Pump 90; ExtKey $vk -Up }
# 팔레트 단축키를 사람처럼 눌러(보조키 0.3초 늦게 떼기) 팔레트를 연다. 이번 palette.show 줄(mode search)을 돌려주고 3초 안에 열리지 않으면 $null.
# 열린 뒤 0.4초 기다린다: 항목과 말하듯 입력 문맥(단어 목록·기억한 문장·사용 기록)이 오기 전에 글을 치면 지난 목록으로 찾는다.
# 팔레트가 이미 열려 있으면 단축키가 팔레트를 닫으므로 닫힌 상태에서 부른다
function PaletteOpen([string]$combo) {
  $mark = LogMark
  HoldCombo $combo 300
  $show = WaitLog $mark 'palette.show' { $_.mode -eq 'search' } 3000
  if ($show) { Pump 400 }
  return $show
}
