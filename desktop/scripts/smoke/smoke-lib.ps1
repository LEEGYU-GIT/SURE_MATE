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
$VK = @{ 'ctrl' = 0x11; 'alt' = 0x12; 'shift' = 0x10; 'space' = 0x20; ' ' = 0x20; '`' = 0xC0; 'f9' = 0x78; 'esc' = 0x1B; 'enter' = 0x0D; 'backspace' = 0x08; 'tab' = 0x09; '/' = 0xBF; '.' = 0xBE; '-' = 0xBD; ',' = 0xBC }
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
# 사람처럼: 옮기고 잠깐 쉬었다 누르고 0.09초 뒤 뗀다
function ClickAt([int]$x, [int]$y, [switch]$Right) {
  MoveTo $x $y; Pump 120
  $down = if ($Right) { 0x0008 } else { 0x0002 }
  $up = if ($Right) { 0x0010 } else { 0x0004 }
  [W]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero); Pump 90
  [W]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
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
