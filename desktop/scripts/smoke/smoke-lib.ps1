# shared helpers for smoke tests (dot-source this)
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  // 맨 위(Z 순서 앞쪽)부터 훑어 처음 만나는 보이는 topmost 창. 크기가 0인 창은 건너뛴다
  public static IntPtr TopTopmost() {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h)) return true;
      if ((GetWindowLong(h, -20) & 0x8) == 0) return true;
      RECT r; GetWindowRect(h, out r);
      if (r.Right - r.Left <= 0 || r.Bottom - r.Top <= 0) return true;
      found = h; return false;
    }, IntPtr.Zero);
    return found;
  }
  // 보이는 topmost 창 전부: { 프로세스 id, 왼쪽, 위, 오른쪽, 아래 }(물리 픽셀)
  public static List<int[]> TopmostRects() {
    List<int[]> list = new List<int[]>();
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h)) return true;
      if ((GetWindowLong(h, -20) & 0x8) == 0) return true;
      RECT r; GetWindowRect(h, out r);
      if (r.Right - r.Left <= 0 || r.Bottom - r.Top <= 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      list.Add(new int[] { (int)pid, r.Left, r.Top, r.Right, r.Bottom });
      return true;
    }, IntPtr.Zero);
    return list;
  }
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public static string Title(IntPtr h){ var sb=new StringBuilder(256); GetWindowText(h,sb,256); return sb.ToString(); }
  public static uint Pid(IntPtr h){ uint p; GetWindowThreadProcessId(h, out p); return p; }
}
"@
# 마우스 좌표와 화면 캡처를 물리 픽셀로 맞춘다(배율 125%·150%에서 DIP×배율 계산이 맞도록)
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

# ---- M5 바·펼침 창 도우미 (좌표 인자는 물리 픽셀, 사각형은 DIP) ----
# 이번 실행(마지막 app.ready 이후)의 로그. $startLines 이전에 찍힌 시작 시점 bar.place도 읽는다
$sessionStart = 0
if (Test-Path $logFile) {
  $allLines = @(Get-Content $logFile -Encoding UTF8)
  for ($i = $allLines.Count - 1; $i -ge 0; $i--) { if ($allLines[$i] -match '"event":"app.ready"') { $sessionStart = $i; break } }
}
function SessionLines { @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $sessionStart) }
function SessionLogs([string]$eventName) { @(SessionLines | Where-Object { $_ -match "`"event`":`"$eventName`"" }) }
function LastBarPlace { $l = SessionLogs 'bar.place' | Select-Object -Last 1; if ($l) { return ($l | ConvertFrom-Json) }; return $null }
function LogCount([string]$eventName) { @(NewLogs $eventName).Count }
# $after번째 이후 새 로그 중 $Match(필드=값)가 모두 맞는 첫 줄을 $ms 안에 기다린다. 없으면 $null
function WaitLog([string]$eventName, [int]$after, [int]$ms, [hashtable]$Match = @{}) {
  $end = (Get-Date).AddMilliseconds($ms)
  do {
    $lines = @(NewLogs $eventName)
    for ($i = $after; $i -lt $lines.Count; $i++) {
      $o = $lines[$i] | ConvertFrom-Json; $ok = $true
      foreach ($k in $Match.Keys) { if ("$($o.$k)" -ne "$($Match[$k])") { $ok = $false } }
      if ($ok) { return $o }
    }
    Pump 50
  } while ((Get-Date) -lt $end)
  return $null
}
function Px([double]$dip, [double]$scale) { [int][math]::Round($dip * $scale) }
function MoveInto([double]$x, [double]$y) { [void][W]::SetCursorPos([int]($x - 3), [int]$y); Pump 40; [void][W]::SetCursorPos([int]$x, [int]$y); Pump 120 }
function HoverAt([double]$x, [double]$y) { MoveInto $x $y }
function ClickAt([double]$x, [double]$y, [switch]$Right) {
  MoveInto $x $y
  $down = if ($Right) { 8 } else { 2 }
  $up = if ($Right) { 16 } else { 4 }
  [W]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero); Pump 70
  [W]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero); Pump 100
}
# 누른 채 세로로 $dy 픽셀 끈다(8픽셀씩 16ms 간격)
function DragBy([double]$x, [double]$y, [double]$dy) {
  MoveInto $x $y
  [W]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Pump 150
  $steps = [math]::Max(1, [int][math]::Ceiling([math]::Abs($dy) / 8))
  for ($i = 1; $i -le $steps; $i++) { [void][W]::SetCursorPos([int]$x, [int]($y + $dy * $i / $steps)); Pump 16 }
  Pump 150
  [W]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero); Pump 100
}
function UnionRect($a, $b) {
  $x = [math]::Min($a.x, $b.x); $y = [math]::Min($a.y, $b.y)
  $r = [math]::Max($a.x + $a.width, $b.x + $b.width); $bt = [math]::Max($a.y + $a.height, $b.y + $b.height)
  [pscustomobject]@{ x = $x; y = $y; width = $r - $x; height = $bt - $y }
}
# DIP 사각형을 배율만큼 키워 %TEMP%\sure-mate-smoke\<이름>.png로 저장
function ShotRect([string]$name, $rectDip, [double]$scale) {
  Add-Type -AssemblyName System.Drawing
  $dir = Join-Path $env:TEMP 'sure-mate-smoke'; New-Item -ItemType Directory -Force $dir | Out-Null
  $x = [int][math]::Floor($rectDip.x * $scale); $y = [int][math]::Floor($rectDip.y * $scale)
  $w = [int][math]::Ceiling($rectDip.width * $scale); $h = [int][math]::Ceiling($rectDip.height * $scale)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size $w, $h))
  $path = Join-Path $dir "$name.png"; $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
  "$name = $path ($w x $h)"
}
function IsAppProcessName([string]$n) { return ($n -eq 'electron' -or $n -eq 'Sure-Mate') }
# 맨 위 topmost 창의 정보(창 제목·프로세스 이름)
function TopmostInfo {
  $h = [W]::TopTopmost()
  if ($h -eq [IntPtr]::Zero) { return $null }
  $p = [W]::Pid($h)
  [pscustomobject]@{ Title = [W]::Title($h); Process = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName }
}
function TopmostIsApp { $t = TopmostInfo; if ($null -eq $t) { return $false }; return (IsAppProcessName $t.Process) }
# Sure-Mate의 topmost 창 중 높이가 $heightPx(±3)이고 오른쪽 끝이 $rightPx(±3)인 창의 물리 픽셀 사각형. 없으면 $null
function BarWindowRect([double]$heightPx, [double]$rightPx) {
  foreach ($t in [W]::TopmostRects()) {
    $n = (Get-Process -Id $t[0] -ErrorAction SilentlyContinue).ProcessName
    if (-not (IsAppProcessName $n)) { continue }
    if ([math]::Abs(($t[4] - $t[2]) - $heightPx) -le 3 -and [math]::Abs($t[3] - $rightPx) -le 3) {
      return [pscustomobject]@{ Left = $t[1]; Top = $t[2]; Right = $t[3]; Bottom = $t[4]; Width = $t[3] - $t[1] }
    }
  }
  return $null
}
