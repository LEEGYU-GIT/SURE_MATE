# Files-only clipboard (like an Explorer file copy): capture must not report a restore it could not do, and must not clear
param([string]$Combo = 'Alt+`')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$tmp = Join-Path $env:TEMP 'sure-mate-filecopy-test.txt'; Set-Content $tmp 'x'
$list = New-Object System.Collections.Specialized.StringCollection; [void]$list.Add($tmp)
[System.Windows.Forms.Clipboard]::SetFileDropList($list)
$r.before_formats = ([System.Windows.Forms.Clipboard]::GetDataObject().GetFormats()) -join ','

$form = New-Object System.Windows.Forms.Form
$form.Text = 'SureMate-Test'; $form.ControlBox = $false; $form.Width = 520; $form.Height = 160; $form.StartPosition = 'CenterScreen'
$tb = New-Object System.Windows.Forms.TextBox
$tb.Width = 480; $tb.Left = 10; $tb.Top = 10; $tb.Text = 'Sure-Mate files clipboard ABC'
$form.Controls.Add($tb)
$form.Show(); Pump 300
Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); $tb.Focus(); $tb.SelectAll(); Pump 300

Combo 'Ctrl+Alt+W'; Pump 3000
$r.capture = NewLogs 'wiki.card' | Select-Object -Last 1
$r.after_formats = ([System.Windows.Forms.Clipboard]::GetDataObject().GetFormats()) -join ','
$r.after_text = [System.Windows.Forms.Clipboard]::GetText()
if ((IsApp)) { Tap $VK['esc']; Pump 500 }
$form.Close(); Remove-Item $tmp
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
