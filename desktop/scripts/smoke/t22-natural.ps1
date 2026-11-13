# M7 말하듯 입력(설계 §13 완료 기준의 실제 앱 확인). t22-run.ps1로 실행한다(설정을 잠시 바꾸고, 워크스페이스·기억한 문장·사용 기록·사용자 단어 목록을
# 비운 채 시작해 끝나면 되돌림). 판정 줄은 README "t22 결과를 눈으로 확인할 곳".
# 글자는 TypeUnicode(KEYEVENTF_UNICODE)로 입력해 한/영 상태와 상관없이 그대로 들어간다. 한글 IME 조합은 거치지 않으므로 IME로 직접 입력하는 확인은 README의 사람 확인 항목이다.
# Enter·Esc·↓·End는 스캔 코드와 사람 타이밍(0.09~0.12초 누름, Shift는 Enter를 뗀 뒤 0.3초 늦게 뗌)으로 보낸다. 클릭은 하지 않는다.
# 로그 읽기: palette.show(mode·bounds), palette.run(id), workspace.save(op·source·ok·id·windows), workspace.restore(source·ok·id·total·placed),
# phrase.learn(keyLength), masking.unmask(restored·tableSize). 앱이 로그로 알리지 않는 화면 순서(↓로 선택한 행)는 실행된 id·phrase-map.json·캡처 m7-remember로 확인한다.
# 단계가 예외로 멈추면 그 단계만 `error_단계` 줄을 남기고 다음 단계로 간다. 앞 단계가 성립하지 않은 판정은 True 대신 `skipped (까닭)`을 출력한다.
param([string]$Combo = 'Alt+`', [switch]$FromRunner)
# t22-run.ps1만 -FromRunner를 넘긴다. 직접 실행하면 사용자 설정·파일을 비우지 않은 채 시작해 결과가 틀리므로 멈춘다
if (-not $FromRunner) { 'error = t22-run.ps1로 실행한다(직접 실행하면 설정과 사용자 파일이 시험 상태가 아니다)'; return }
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$appDir = Join-Path $env:APPDATA 'Sure-Mate'
# 시험 문장(가상). 워크스페이스 '보고서 모드'는 1단계에서 `@` 저장 줄로 만들고, 나머지 문장은 그 이름과 기본 프롬프트·명령을 찾는다.
# 기본 자료 기준 맨 위(리눅스에서 실제 랭커로 계산): 회의록 정리해줘·영문 자판 → prompt:meeting-notes, 보고서 모드로 바꿔줘 → 그 워크스페이스,
# 가명 되돌려줘 → cmd.unmask, 보고서 띄워줘 → prompt:weekly-report(950점)이고 둘째 행이 그 워크스페이스(900점). 말하듯 입력이 꺼진 M4 검색에서는
# 다섯 문장 모두 맞는 항목이 없다(목록에 '직접 추가하기'만 남아 Enter가 palette.run을 남기지 않는다)
$wsName = '보고서 모드'
$S = [ordered]@{
  prompt = '회의록 정리해줘'
  english = 'ghldmlfhr wjdflgownj'
  workspace = '보고서 모드로 바꿔줘'
  unmask = '가명 되돌려줘'
  remember = '보고서 띄워줘'
}
# 로그에 없어야 하는 입력 조각(위 문장들과 저장 이름, 영문 자판 상태로 입력한 글. 학습 키 '보고서띄워줘'는 '보고서'로 걸린다)
$phrases = @('회의록', '보고서', '가명 되돌려', '띄워', '바꿔줘', '정리해줘', 'ghldmlfhr', 'wjdflgownj')
# 문장을 담는 키. 값이 글자·배열일 때만 걸린다(palette.key의 "key":"Escape", phrase.learn의 "keyLength", masking.unmask의 "inputLength",
# workspace.edit의 "aliases":숫자 같은 정상 줄은 걸리지 않는다)
$typedKeyPattern = '"(text|query|sentence|phrase|input|title|name|label|words|aliases)"\s*:\s*["\[]'
$script:typed = 0
$script:askWhy = ''

function FocusForm { Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); Pump 300 }
# 앞 창이 앱 창(팔레트)이면 Esc로 닫는다(확인 화면·위키 화면 → 목록 → 닫힘까지 세 번)
function ClosePalette { for ($i = 0; $i -lt 3 -and (IsApp); $i++) { TapHuman 0x1B; Pump 700 } }
# 팔레트를 열고 글을 친다. 팔레트가 앞에 있을 때만 치고 $true. 열리지 않았거나 앞에 없으면 $false이고 까닭은 $script:askWhy(그 단계 판정은 skipped)
function Ask([string]$text) {
  ClosePalette
  FocusForm
  $show = PaletteOpen $Combo
  if (-not $show) { $script:askWhy = 'the palette did not open (no palette.show within 3 s)'; return $false }
  if (-not (IsApp)) { $script:askWhy = 'the palette is not the foreground window'; return $false }
  TypeUnicode $text
  $script:typed++
  Pump 900
  if (-not (IsApp)) { $script:askWhy = 'the palette lost the foreground while typing'; return $false }
  return $true
}
function PressEnter { Key 0x0D; Pump 120; Key 0x0D -Up }
# Shift를 누른 채 Enter. Shift는 Enter를 뗀 뒤 0.3초 늦게 뗀다(앱은 Enter·보조키를 뗀 것을 0.6초까지 기다린 뒤 팔레트를 숨긴다)
function ShiftEnter { Key 0x10; Pump 80; Key 0x0D; Pump 120; Key 0x0D -Up; Pump 300; Key 0x10 -Up }
# 프롬프트를 실행한 뒤: 확인 화면(palette.show mode confirm)을 기다렸다가 Esc로 목록, Esc로 닫는다
function CloseConfirm([int]$mark) {
  [void](WaitLog $mark 'palette.show' { $_.mode -eq 'confirm' } 5000)
  Pump 500
  ClosePalette
}
# 실행한 항목의 뒷정리: 프롬프트면 확인 화면을 닫고, 워크스페이스면 불러오기(workspace.restore)가 끝날 때까지 기다린 뒤 남은 팔레트를 닫는다
function AfterRun([int]$mark, $run) {
  $id = if ($run) { [string]$run.id } else { '' }
  if ($id.StartsWith('prompt:')) { CloseConfirm $mark; return }
  if ($id.StartsWith('workspace:')) { [void](WaitLog $mark 'workspace.restore' { $_.source -eq 'palette' } 15000) }
  Pump 600
  ClosePalette
}
function ReadJson([string]$path) {
  try { if (Test-Path $path) { return (Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json) } } catch { }
  return $null
}
function RunText($run) { if ($run) { return [string]$run.id }; return 'none' }

$form = $null
try {
  # 0. t22-run.ps1이 비운 상태인지(직접 실행하면 사용자 파일을 바꾸고, 최근 항목·학습이 목록 순서를 바꾼다).
  #    앱은 시작할 때 기본 워크스페이스 '화면 감추기'(id builtin-hide)를 만들므로 workspaces.json에 그것만 있으면 빈 상태다
  $left = @(@('phrase-map.json', 'usage.json', 'intents.json') | Where-Object { Test-Path (Join-Path $appDir $_) })
  $wsPath = Join-Path $appDir 'workspaces.json'
  if (Test-Path $wsPath) {
    $wsDoc = $null; try { $wsDoc = Get-Content $wsPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
    if (-not $wsDoc) { $left += 'workspaces.json (unreadable)' }
    elseif (@(@($wsDoc.workspaces) | Where-Object { $_ -and $_.id -ne 'builtin-hide' }).Count -gt 0) { $left += 'workspaces.json (a workspace other than the built-in one)' }
  }
  if ($left.Count -gt 0) { throw "t22-run.ps1로 실행한다(시작할 때 없어야 하는 파일이 있다: $($left -join ', '))" }
  $r.info_palette_hotkey = $Combo
  # 클립보드는 시험 중 가짜 글로 바뀐다. t22-run.ps1이 시작 전 글자 내용을 저장해 두었다가 되돌린다(내용은 로그·출력에 남기지 않는다)
  [System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')
  $form = NewTestForm

  # 1. 팔레트 @ + '보고서 모드' → 목록 끝 '이름으로 지금 배치 저장' 줄(End) → Enter → workspace.save(ok, 출처 palette), workspaces.json의 그 id 이름이 '보고서 모드'
  $wsId = $null
  try {
    if (Ask ('@' + $wsName)) {
      ExtTapHuman 0x23; Pump 300
      $mark = LogMark
      PressEnter
      $save = WaitLog $mark 'workspace.save' { $_.source -eq 'palette' } 6000
      if ($save -and $save.ok -eq $true) {
        $doc = ReadJson (Join-Path $appDir 'workspaces.json')
        $mine = if ($doc) { @($doc.workspaces | Where-Object { $_.id -eq $save.id }) } else { @() }
        $named = ($mine.Count -eq 1 -and $mine[0].name -eq $wsName)
        $r.workspace_saved = $named
        if ($named) { $wsId = [string]$save.id }
        $r.info_save = 'op={0} windows={1} minimized={2} excluded={3} offscreen={4} monitors={5} file_has_id_and_name={6}' -f $save.op, $save.windows, $save.minimized, $save.excluded, $save.offscreen, $save.monitors, $named
      } else {
        $r.workspace_saved = $false
        $r.info_save = if ($save) { 'ok={0} reason={1}' -f $save.ok, $save.reason } else { 'no workspace.save log within 6 s' }
      }
      Pump 800
      ClosePalette
    } else { $r.workspace_saved = "skipped ($script:askWhy)" }
  } catch { $r['error_1_save'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 2. '회의록 정리해줘' → 의도 표시 캡처(m7-natural-chip) → Enter → palette.run id prompt:meeting-notes → 확인 화면을 Esc 두 번으로 닫기
  try {
    if (Ask $S.prompt) {
      Shot 'm7-natural-chip'
      $mark = LogMark
      PressEnter
      $run = WaitLog $mark 'palette.run' { $true } 3000
      $r.natural_prompt = ($null -ne $run -and $run.id -eq 'prompt:meeting-notes')
      $r.info_natural_prompt = 'ran=' + (RunText $run)
      AfterRun $mark $run
    } else { $r.natural_prompt = "skipped ($script:askWhy)" }
  } catch { $r['error_2_prompt'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 3. 영문 자판 상태로 친 같은 문장('ghldmlfhr wjdflgownj', 글자 그대로 입력) → Enter → 같은 id
  try {
    if (Ask $S.english) {
      $mark = LogMark
      PressEnter
      $run = WaitLog $mark 'palette.run' { $true } 3000
      $r.english_mode = ($null -ne $run -and $run.id -eq 'prompt:meeting-notes')
      $r.info_english_mode = 'ran=' + (RunText $run)
      AfterRun $mark $run
    } else { $r.english_mode = "skipped ($script:askWhy)" }
  } catch { $r['error_3_english'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 4. '보고서 모드로 바꿔줘' → Enter → palette.run id가 1단계 워크스페이스이고 그 id의 workspace.restore(출처 palette)가 ok
  try {
    if (-not $wsId) { $r.natural_workspace = 'skipped (step 1 did not save the test workspace: see workspace_saved)' }
    elseif (Ask $S.workspace) {
      $mark = LogMark
      PressEnter
      $run = WaitLog $mark 'palette.run' { $true } 3000
      $rest = WaitLog $mark 'workspace.restore' { $_.source -eq 'palette' } 15000
      $r.natural_workspace = ($null -ne $run -and $run.id -eq "workspace:$wsId" -and $null -ne $rest -and $rest.ok -eq $true -and $rest.id -eq $wsId)
      $r.info_natural_workspace = if ($rest) { 'ran={0} restore_ok={1} reason={2} total={3} placed={4} maxDiff={5} ms={6} restoredFocus={7}' -f (RunText $run), $rest.ok, $rest.reason, $rest.total, $rest.placed, $rest.maxDiff, $rest.ms, $rest.restoredFocus } else { 'ran={0} no workspace.restore within 15 s' -f (RunText $run) }
      AfterRun $mark $run
    } else { $r.natural_workspace = "skipped ($script:askWhy)" }
  } catch { $r['error_4_workspace'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 4-2. '가명 되돌려줘' → Enter → palette.run id cmd.unmask. AI 답을 복사했다고 치고 가상 표시가 든 글을 클립보드에 둔다
  # (가명 대응표가 비어 있어 되돌리지는 않고 알림만 뜬다. masking.unmask 줄은 참고값)
  try {
    [System.Windows.Forms.Clipboard]::SetText('CLIENT_A 담당자에게 일정을 공유한다')
    if (Ask $S.unmask) {
      $mark = LogMark
      PressEnter
      $run = WaitLog $mark 'palette.run' { $true } 3000
      $um = WaitLog $mark 'masking.unmask' { $true } 3000
      $r.natural_unmask = ($null -ne $run -and $run.id -eq 'cmd.unmask')
      $r.info_natural_unmask = if ($um) { 'ran={0} unmask_log=True restored={1} tableSize={2}' -f (RunText $run), $um.restored, $um.tableSize } else { 'ran={0} unmask_log=False' -f (RunText $run) }
      AfterRun $mark $run
    } else { $r.natural_unmask = "skipped ($script:askWhy)" }
  } catch { $r['error_4_unmask'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 5. 기억하기: '보고서 띄워줘' → ↓ 한 번(둘째 행 '보고서 모드') → 캡처 m7-remember → Shift+Enter → phrase.learn,
  #    실행한 id가 그 워크스페이스, phrase-map.json에 그 워크스페이스로 가는 줄이 하나(시험 앞에 지운 파일이라 이번 시험의 줄만 있다)
  $learned = $false
  try {
    if (-not $wsId) { $r.remember_learned = 'skipped (step 1 did not save the test workspace: see workspace_saved)' }
    elseif (Ask $S.remember) {
      ExtTapHuman 0x28; Pump 600
      if (IsApp) { Shot 'm7-remember' }
      $mark = LogMark
      ShiftEnter
      $learn = WaitLog $mark 'phrase.learn' { $true } 3000
      $run = WaitLog $mark 'palette.run' { $true } 3000
      Pump 300
      $map = ReadJson (Join-Path $appDir 'phrase-map.json')
      $entries = if ($map) { @($map.entries) } else { @() }
      $toWs = @($entries | Where-Object { $_.id -eq "workspace:$wsId" })
      $learned = ($null -ne $learn -and $null -ne $run -and $run.id -eq "workspace:$wsId" -and $toWs.Count -eq 1)
      $r.remember_learned = $learned
      $r.info_remember = 'ran={0} phrase_learn_log={1} map_entries={2} map_to_workspace={3} key_is_expected={4}' -f (RunText $run), ($null -ne $learn), $entries.Count, $toWs.Count, ($toWs.Count -eq 1 -and $toWs[0].key -eq '보고서띄워줘')
      AfterRun $mark $run
    } else { $r.remember_learned = "skipped ($script:askWhy)" }
  } catch { $r['error_5_remember'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 5-2. 다시 '보고서 띄워줘' → Enter → 기억한 워크스페이스가 맨 위(기억하기 전 맨 위는 주간보고 초안이었다: 기억하기 안내는 맨 위가 아닌 행에만 뜬다)
  try {
    if (-not $learned) { $r.learned_top = 'skipped (the sentence was not remembered for the test workspace: see remember_learned)' }
    elseif (Ask $S.remember) {
      $mark = LogMark
      PressEnter
      $run = WaitLog $mark 'palette.run' { $true } 3000
      $r.learned_top = ($null -ne $run -and $run.id -eq "workspace:$wsId")
      $r.info_learned_top = 'ran=' + (RunText $run)
      AfterRun $mark $run
    } else { $r.learned_top = "skipped ($script:askWhy)" }
  } catch { $r['error_5_learned'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 6. 로그에 입력 문장·저장 이름·학습 문장이 없다(id·건수·길이만). 문장이 하나도 팔레트에 들어가지 않았으면 판정하지 않는다
  $appLines = @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $startLines) -join "`n"
  # 앱 로그가 비어 있으면 없다는 판정이 거짓 True가 되므로, 이번 실행의 palette.run·workspace.save 줄이 있어야 판정한다
  $appLogLines = @(NewLogs 'palette.run').Count + @(NewLogs 'workspace.save').Count
  if ($script:typed -eq 0) {
    $r.log_has_no_phrases = 'skipped (no sentence reached the palette)'
    $r.log_has_no_typed_text = 'skipped (no sentence reached the palette)'
  } elseif ($appLogLines -eq 0) {
    $r.log_has_no_phrases = 'skipped (no app log lines)'
    $r.log_has_no_typed_text = 'skipped (no app log lines)'
  } else {
    $found = @($phrases | Where-Object { $appLines.Contains($_) })
    $r.log_has_no_phrases = ($found.Count -eq 0)
    if ($found.Count -gt 0) { $r.info_phrases_in_log = $found -join ', ' }
    $r.log_has_no_typed_text = -not ($appLines -match $typedKeyPattern)
    $r.info_sentences_typed = '{0} of 7' -f $script:typed
  }
  $r.info_foreground_end = (Fg).Title
} catch {
  $r.error = "$_ at line $($_.InvocationInfo.ScriptLineNumber)"
} finally {
  if ($form) { try { $form.Close() } catch { } }
  $r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
}
