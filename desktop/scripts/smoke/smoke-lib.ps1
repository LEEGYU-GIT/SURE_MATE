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
}
"@
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
function NewLogs([string]$event) { @(Get-Content $logFile | Select-Object -Skip $startLines | Where-Object { $_ -match "`"event`":`"$event`"" }) }
function NewTestForm {
  $f = New-Object System.Windows.Forms.Form
  $f.Text = 'SureMate-Test'; $f.ControlBox = $false; $f.Width = 420; $f.Height = 200; $f.StartPosition = 'CenterScreen'
  $f.Show(); Pump 300
  Key 0x12; [void][W]::SetForegroundWindow($f.Handle); Key 0x12 -Up; $f.Activate(); Pump 400
  return $f
}
function IsApp { $p = (Fg).Process; return ($p -eq 'electron' -or $p -eq 'Sure-Mate') }
