# Task 9 smoke: capture selection (restore clipboard), nothing selected, paste test, clipboard exclude format
param([string]$Combo = 'Alt+`')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class W3 { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd); }
"@
$r = [ordered]@{}
[System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')

$form = New-Object System.Windows.Forms.Form
$form.Text = 'SureMate-Test'; $form.ControlBox = $false; $form.Width = 520; $form.Height = 160; $form.StartPosition = 'CenterScreen'
$tb = New-Object System.Windows.Forms.TextBox
$tb.Width = 480; $tb.Left = 10; $tb.Top = 10; $tb.Text = 'Sure-Mate capture test ABC'
$form.Controls.Add($tb)
$form.Show(); [void][W3]::ShowWindow($form.Handle, 5); Pump 300
Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); $tb.Focus(); Pump 300

# 1) selection -> capture, clipboard restored
$tb.SelectAll(); Pump 100
Combo 'Ctrl+Alt+W'; Pump 1500
$r.capture_selected = NewLogs 'wiki.card' | Select-Object -Last 1
$r.clipboard_after_capture = [System.Windows.Forms.Clipboard]::GetText()
if ((IsApp)) { Tap $VK['esc']; Pump 600 }

# 2) nothing selected -> null, clipboard untouched
$form.Activate(); $tb.Focus(); $tb.SelectionStart = 0; $tb.SelectionLength = 0; Pump 200
Combo 'Ctrl+Alt+W'; Pump 1500
$r.capture_none = NewLogs 'wiki.card' | Select-Object -Last 1
$r.clipboard_after_none = [System.Windows.Forms.Clipboard]::GetText()
if ((IsApp)) { Tap $VK['esc']; Pump 600 }

# 3) paste test into the textbox
$form.Activate(); $tb.Focus(); $tb.Text = ''; Pump 200
Combo $Combo; Pump 900
if ((IsApp)) { TypeAscii 'paste'; Pump 300; Tap $VK['enter']; Pump 1500 }
$r.paste_log = NewLogs 'dev.paste' | Select-Object -Last 1
$r.textbox_after_paste = $tb.Text

# 4) clipboard exclude format
$form.Activate(); Pump 200
Combo $Combo; Pump 900
if ((IsApp)) { TypeAscii 'clipboard'; Pump 300; Tap $VK['enter']; Pump 1200 }
$r.exclude_log = NewLogs 'dev.clipboardExclude' | Select-Object -Last 1
$formats = [System.Windows.Forms.Clipboard]::GetDataObject().GetFormats()
$r.clipboard_formats = ($formats -join ',')
if ((IsApp)) { Tap $VK['esc']; Pump 500 }

$form.Close()
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
