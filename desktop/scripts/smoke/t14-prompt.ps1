# M2 prompt flow: select text -> palette -> "/" -> Enter (회의록 정리) -> confirm -> Enter (복사만) -> clipboard has the prompt.
# Then with nothing selected: confirm defaults to the clipboard, Esc goes back to the list. Run through t14-run.ps1 (sets AI target to 복사만).
param([string]$Combo = 'Alt+`')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$selected = 'Sure-Mate prompt test ABC 123'

[System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')
$form = New-Object System.Windows.Forms.Form
$form.Text = 'SureMate-Test'; $form.ControlBox = $false; $form.Width = 520; $form.Height = 160; $form.StartPosition = 'CenterScreen'
$tb = New-Object System.Windows.Forms.TextBox
$tb.Width = 480; $tb.Left = 10; $tb.Top = 10; $tb.Text = $selected
$form.Controls.Add($tb)
$form.Show(); Pump 300
Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); $tb.Focus(); $tb.SelectAll(); Pump 300

# 1) selection -> confirm -> run (copy only)
Combo $Combo; Pump 900
TypeAscii '/'; Pump 500
Tap $VK['enter']; Pump 1800
$r.prepare = NewLogs 'prompt.prepare' | Select-Object -Last 1
$r.confirm_in_front = (IsApp)
if ((IsApp)) { Shot 'confirm-selection' }
Tap $VK['enter']; Pump 1000
$r.run = NewLogs 'prompt.run' | Select-Object -Last 1
$clip = [System.Windows.Forms.Clipboard]::GetText()
$r.clipboard_has_selection = $clip.Contains($selected)
$r.clipboard_has_rules = $clip.Contains('추측하지')
$r.clipboard_length = $clip.Length
$r.log_has_no_text = -not ("$($r.prepare)$($r.run)".Contains('prompt test'))
$r.textbox_unchanged = ($tb.Text -eq $selected)
$r.foreground_after_run = (Fg).Title

# 2) nothing selected -> confirm defaults to clipboard, Esc back to list, Esc closes
[System.Windows.Forms.Clipboard]::SetText('CLIP-ONLY TEXT')
$form.Activate(); $tb.Focus(); $tb.SelectionStart = 0; $tb.SelectionLength = 0; Pump 300
$runs = @(NewLogs 'prompt.run').Count
Combo $Combo; Pump 900
TypeAscii '/'; Pump 500
Tap $VK['enter']; Pump 2200
$r.prepare_nothing = NewLogs 'prompt.prepare' | Select-Object -Last 1
if ((IsApp)) { Shot 'confirm-clipboard' }
Tap $VK['esc']; Pump 600
$r.back_to_list_in_front = (IsApp)
if ((IsApp)) { Shot 'list-after-back' }
Tap $VK['esc']; Pump 600
$r.closed = -not (IsApp)
$r.no_extra_run = (@(NewLogs 'prompt.run').Count -eq $runs)

$form.Close()
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
