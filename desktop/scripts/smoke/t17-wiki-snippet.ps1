# M4 위키·상용구: 팔레트 "?" + mcdc → MC/DC가 맨 위(캡처) → Enter 상세(캡처) → Enter 설명 복사 → 클립보드에 설명.
# 이어서 시험 창 글상자에서 "!" + issue → Enter → 글상자에 결함 리포트 양식이 한 번만(캡처).
# 로그에는 용어·설명·상용구 본문이 없어야 한다(id·길이만). 설정을 바꾸지 않으므로 run-smoke.ps1로 바로 돌린다.
param([string]$Combo = 'Alt+`')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$res = Join-Path $PSScriptRoot '..\..\resources'
# 기대 글은 앱에 들어 있는 기본 자료에서 읽는다(복사해 둔 글이 어긋나지 않게)
$glossary = Get-Content (Join-Path $res 'glossary.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$expectedDef = ($glossary.entries | Where-Object { $_.id -eq 'mcdc' } | Select-Object -First 1).definition
$prompts = Get-Content (Join-Path $res 'prompts.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$expectedBody = ($prompts.templates | Where-Object { $_.id -eq 'defect-report' } | Select-Object -First 1).body
$r.expected_loaded = ([bool]$expectedDef -and [bool]$expectedBody)

# 사람처럼 Enter를 0.15초 눌렀다 뗀다
function HoldEnter { Key $VK['enter']; Pump 150; Key $VK['enter'] -Up }
# 보조키를 누른 채 한 글자: ? = Shift+/, ! = Shift+1 (보조키는 0.2초 늦게 뗀다)
function ShiftedKey([string]$k) { Key $VK['shift']; Pump 60; Tap (VkOf $k); Pump 200; Key $VK['shift'] -Up }

[System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')
$form = New-Object System.Windows.Forms.Form
$form.Text = 'SureMate-Test'; $form.ControlBox = $false; $form.Width = 520; $form.Height = 420; $form.StartPosition = 'CenterScreen'
$tb = New-Object System.Windows.Forms.TextBox
$tb.Multiline = $true; $tb.AcceptsReturn = $true; $tb.Width = 480; $tb.Height = 340; $tb.Left = 10; $tb.Top = 10
$form.Controls.Add($tb)
$form.Show(); Pump 300
Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); $tb.Focus(); Pump 400

# 1. 위키: ? + mcdc → MC/DC가 맨 위
Combo $Combo; Pump 900
ShiftedKey '/'; Pump 300
TypeAscii 'mcdc'; Pump 700
if ((IsApp)) { Shot 'm4-wiki-search' }
HoldEnter; Pump 900
$r.detail_in_front = (IsApp)
if ((IsApp)) { Shot 'm4-wiki-detail' }

# 2. 상세에서 Enter → 설명 복사
HoldEnter; Pump 900
$copyLogs = @(NewLogs 'wiki.copy')
$copyLog = if ($copyLogs.Count -gt 0) { $copyLogs[-1] | ConvertFrom-Json } else { $null }
$r.wiki_copy_logged_once = ($copyLogs.Count -eq 1)
$r.wiki_copy_log_id_length_only = ($null -ne $copyLog -and $copyLog.id -eq 'mcdc' -and $copyLog.length -eq $expectedDef.Length)
$clip = [System.Windows.Forms.Clipboard]::GetText()
$r.clipboard_is_definition = ($clip -eq $expectedDef)
$r.clipboard_length = $clip.Length
if ((IsApp)) { Tap $VK['esc']; Pump 400; Tap $VK['esc']; Pump 700 }
$r.info_foreground_after_wiki = (Fg).Title

# 3. 상용구: 시험 창 글상자에서 ! + issue → Enter → 결함 리포트 양식이 한 번만
$tb.Text = ''
$form.Activate(); $tb.Focus(); Pump 400
Combo $Combo; Pump 900
ShiftedKey '1'; Pump 300
TypeAscii 'issue'; Pump 700
if ((IsApp)) { Shot 'm4-snippet-search' }
HoldEnter; Pump 1800
$snipLogs = @(NewLogs 'snippet.run')
$snipLog = if ($snipLogs.Count -gt 0) { $snipLogs[-1] | ConvertFrom-Json } else { $null }
$r.snippet_logged_once = ($snipLogs.Count -eq 1)
$r.snippet_pasted = ($null -ne $snipLog -and $snipLog.result -eq 'pasted' -and $snipLog.templateId -eq 'defect-report' -and $snipLog.length -eq $expectedBody.Length)
$text = $tb.Text.Replace("`r`n", "`n")
$r.textbox_is_form = ($text -eq $expectedBody)
$r.textbox_form_count = ([regex]::Matches($text, [regex]::Escape('[결함 제목]'))).Count
$r.textbox_length = $text.Length
$r.info_foreground_after_snippet = (Fg).Title

# 4. 로그에 용어·설명·본문이 없어야 한다
$appLines = @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $startLines) -join "`n"
$r.log_has_no_content = -not ($appLines.Contains('MC/DC') -or $appLines.Contains($expectedDef.Substring(0, 12)) -or $appLines.Contains('결함 제목'))
$r.log_has_no_typed_text = -not ($appLines -match '"query"|"text"|"definition"|"body"')

$form.Close()
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
