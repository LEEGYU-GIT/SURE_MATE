# M3 가명 처리: §8 예시 글 선택 → 팔레트 "/" → 회의록 정리 → 확인 화면(되돌리기·빼기·끔 캡처, 항목 끄기) → 복사만 → 클립보드에 가명.
# 가상 예시 사전과 "복사만" 대상이 필요하므로 t16-run.ps1로 돌린다.
param([string]$Combo = 'Alt+`')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
# 설계 문서 §8 완료 기준 예시 그대로(이름은 가상). 조사는 가릴 때 그대로 두고 되돌릴 때 다시 고른다
$selected = '가상자동차에서 받은 SRS를 XY방산는 10.0.3.15의 \\fs01\proj 폴더에 올림'
$expectedMasked = 'CLIENT_A에서 받은 SRS를 CLIENT_B는 IP_1의 PATH_1 폴더에 올림'

[System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')
$form = New-Object System.Windows.Forms.Form
$form.Text = 'SureMate-Test'; $form.ControlBox = $false; $form.Width = 620; $form.Height = 160; $form.StartPosition = 'CenterScreen'
$tb = New-Object System.Windows.Forms.TextBox
$tb.Width = 580; $tb.Left = 10; $tb.Top = 10; $tb.Text = $selected
$form.Controls.Add($tb)
$form.Show(); Pump 300
Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); $tb.Focus(); $tb.SelectAll(); Pump 300

Combo $Combo; Pump 900
TypeAscii '/'; Pump 500
Tap $VK['enter']; Pump 1800
$r.prepare = NewLogs 'prompt.prepare' | Select-Object -Last 1
$r.confirm_in_front = (IsApp)
if ((IsApp)) { Shot 'm3-confirm-restore' }

Combo 'alt+m'; Pump 700
if ((IsApp)) { Shot 'm3-confirm-remove' }
Combo 'alt+m'; Pump 700
if ((IsApp)) { Shot 'm3-confirm-off' }
Combo 'alt+m'; Pump 700

# 출처 → 가명 처리 → 항목, Space로 첫 항목 끄기 → 캡처 → 다시 켜기
Tap $VK['tab']; Pump 200
Tap $VK['tab']; Pump 200
Tap $VK['space']; Pump 700
if ((IsApp)) { Shot 'm3-confirm-item-off' }
Tap $VK['space']; Pump 700

Tap $VK['enter']; Pump 1200
$r.run = NewLogs 'prompt.run' | Select-Object -Last 1
$clip = [System.Windows.Forms.Clipboard]::GetText()
$r.clipboard_masked_line = $clip.Contains($expectedMasked)
$r.clipboard_no_names = -not ($clip.Contains('가상자동차') -or $clip.Contains('XY방산') -or $clip.Contains('10.0.3.15') -or $clip.Contains('fs01'))
$r.clipboard_preamble = $clip.Contains('같은 표시는 가린 이름입니다')
$r.clipboard_length = $clip.Length
$r.log_has_no_names = -not ("$($r.prepare)$($r.run)" -match '가상자동차|XY방산|10\.0\.3\.15|fs01')
$r.textbox_unchanged = ($tb.Text -eq $selected)
$r.foreground_after_run = (Fg).Title

$form.Close()
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
