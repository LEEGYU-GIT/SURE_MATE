# M5 바·펼침 창·위키 카드(설계 §14-1·§9 완료 기준). t18-run.ps1로 실행한다(AI 대상 "복사만", 오른쪽 가장자리 띠로 잠시 바꾸고 되돌림).
# 좌표는 앱 로그(bar.place·flyout.show)의 DIP에 배율을 곱한 물리 픽셀(주 모니터). 판정 줄은 README "t18 결과를 눈으로 확인할 곳".
# -AutoHide: 자동 숨김을 켠 두 번째 실행(손잡이로 접힘·0.4초 올리면 펴짐)만 확인한다.
param([string]$Combo = 'Alt+`', [switch]$AutoHide)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$settingsPath = Join-Path $env:APPDATA 'Sure-Mate\settings.json'
$desktopDir = (Resolve-Path "$PSScriptRoot\..\..").Path

function ReadSettings { Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json }
# 앱이 설정 파일을 다 쓸 때까지 다시 읽으며 기다린다
function WaitSetting([scriptblock]$ok, [int]$timeoutMs) {
  $end = (Get-Date).AddMilliseconds($timeoutMs)
  do { try { if (& $ok (ReadSettings)) { return $true } } catch { }; Pump 100 } while ((Get-Date) -lt $end)
  return $false
}
$scr = [System.Windows.Forms.Screen]::PrimaryScreen
# 커서를 바·펼침 창에서 치워 둘 곳(화면 왼쪽 40%, 가운데 높이)
$away = [pscustomobject]@{ x = [int]($scr.Bounds.Width * 0.4); y = [int]($scr.Bounds.Height * 0.5) }
function Away { MoveTo $away.x $away.y }
# 바 둘레에 여백을 붙이고 화면 안으로 자른 캡처 사각형(DIP)
function AroundBar($p, [int]$margin = 16) {
  $s = [double]$p.scale
  $x = [Math]::Max(0, $p.bounds.x - $margin); $y = [Math]::Max(0, $p.bounds.y - $margin)
  $right = [Math]::Min($scr.Bounds.Width / $s, $p.bounds.x + $p.bounds.width + $margin)
  $bottom = [Math]::Min($scr.Bounds.Height / $s, $p.bounds.y + $p.bounds.height + $margin)
  [pscustomobject]@{ x = $x; y = $y; width = [Math]::Floor($right - $x); height = [Math]::Floor($bottom - $y) }
}
# 메뉴 카드 안 세로 위치(DIP)의 행을 누른다
function ClickMenuRow($flyout, [int]$rowCenter, [double]$scale) {
  $c = MenuCard $flyout.bounds
  ClickAt ([int][Math]::Round(($c.x + $c.width / 2) * $scale)) ([int][Math]::Round(($c.y + $rowCenter) * $scale))
}
# 보조키를 누른 채 키를 누르고, 보조키는 lateMs 늦게 뗀다(사람 손 타이밍)
function HoldCombo([string]$acc, [int]$lateMs) {
  $t = $acc.ToLower().Split('+'); $mods = @($t[0..($t.Count - 2)] | ForEach-Object { VkOf $_ })
  foreach ($m in $mods) { Key $m; Pump 40 }
  Tap (VkOf $t[-1]); Pump $lateMs
  foreach ($m in $mods[($mods.Count - 1)..0]) { Key $m -Up; Pump 20 }
}

# 1. 바 배치: 오른쪽 가장자리 띠, 너비 56, 크기 어긋남 기록 없음
$place = LastBarPlace
if (-not $place) { 'bar_place_found = False (바가 뜨지 않았다: 앱 로그의 bar.startError를 본다)'; exit 1 }
$scale = [double]$place.scale
$r.bar_place_found = $true
$r.info_bar = '{0} {1} x={2} y={3} w={4} h={5} scale={6} items={7}' -f $place.shape, $place.edge, $place.bounds.x, $place.bounds.y, $place.bounds.width, $place.bounds.height, $scale, $place.items
$r.bar_no_mismatch = (@(SinceAppReady 'bar.place.mismatch').Count -eq 0)
Away; Pump 300

if ($AutoHide) {
  # 10. 자동 숨김: 바를 떠나고 1초 뒤 화면 끝 6 DIP 손잡이로 접힌다. 0.2초만 올리면 그대로, 0.4초 올리면 펴진다
  Pump 1600
  $col = LastBarPlace
  $waRight = $scr.WorkingArea.Right / $scale
  # 손잡이 6 DIP는 배율에 따라 물리 픽셀로 반올림되어 5~7로 읽힐 수 있다(1.25배: 7.5px)
  $r.autohide_collapsed = ([Math]::Abs($col.bounds.width - 6) -le 1 -and [Math]::Abs(($col.bounds.x + $col.bounds.width) - $waRight) -le 1)
  $r.info_handle = 'x={0} w={1} work_area_right={2}' -f $col.bounds.x, $col.bounds.width, $waRight
  ShotRect 'm5-bar-handle' (AroundBar $col 24) $scale
  $hx = [int][Math]::Round(($col.bounds.x + 3) * $scale); $hy = [int][Math]::Round(($col.bounds.y + $col.bounds.height / 2) * $scale)
  $mark = LogMark
  HoverAt $hx $hy; Pump 200; Away; Pump 500
  $r.autohide_short_hover_stays = (@(LogsAfter $mark 'bar.place' | Where-Object { $_.bounds.width -gt 7 }).Count -eq 0)
  $mark = LogMark
  HoverAt $hx $hy; Pump 400
  $r.autohide_hover_opens = ($null -ne (WaitLog $mark 'bar.place' { $_.bounds.width -eq 56 } 1000))
  Away
  $r.autohide_collapses_again = ($null -ne (WaitLog $mark 'bar.place' { $_.bounds.width -le 7 } 3000))
  $appLines = @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $startLines) -join "`n"
  $r.log_has_no_typed_text = -not ($appLines -match '"(text|query|definition|selection)":')
  $r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
  return
}

$r.bar_width_56 = ($place.bounds.width -eq 56 -and $place.shape -eq 'edge' -and $place.edge -eq 'right')
ShotRect 'm5-bar-edge' (AroundBar $place) $scale

# 시험 창: 가짜 회의 메모(가명 처리 대상이 없는 글)
[System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')
$form = New-Object System.Windows.Forms.Form
$form.Text = 'SureMate-Test'; $form.ControlBox = $false; $form.Width = 560; $form.Height = 300; $form.StartPosition = 'CenterScreen'
$tb = New-Object System.Windows.Forms.TextBox
$tb.Multiline = $true; $tb.HideSelection = $false; $tb.Width = 520; $tb.Height = 240; $tb.Left = 10; $tb.Top = 10
$form.Controls.Add($tb)
$line = '브레이크 제어기 시험 일정은 다음 주 금요일까지 확정한다'
$tb.Text = "주간 회의 메모`r`n$line`r`n정적분석 결과에서 MC/DC 커버리지가 부족한 함수를 다시 본다"
$form.Show(); Pump 300
Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); $tb.Focus(); Pump 400
function FocusTest { Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); $tb.Focus(); Pump 300 }

# 2. 일부 선택 → 첫 고정 프롬프트 → 확인 화면 없이 실행(복사만), 선택·앞 창 그대로
$selStart = $tb.Text.IndexOf($line); $tb.Select($selStart, $line.Length); Pump 200
$mark = LogMark
$pt = BarPointPx $place 'prompt1'
ClickAt $pt.x $pt.y
$pb = WaitLog $mark 'prompt.bar' { $true } 8000
Pump 600
$r.prompt_bar_ran = ($null -ne $pb -and $pb.result -eq 'ran')
$r.info_prompt_bar = if ($pb) { '{0} {1} selection={2}' -f $pb.templateId, $pb.result, $pb.selectionLength } else { 'none' }
$r.prompt_clipboard_has_selection = ([System.Windows.Forms.Clipboard]::GetText()).Contains($line)
$r.prompt_selection_kept = ($tb.SelectionStart -eq $selStart -and $tb.SelectionLength -eq $line.Length)
$r.prompt_kept_focus = ((Fg).Title -eq 'SureMate-Test')

# 3. 방패 → 가명 처리 메뉴(행: 끔 58 · 가명 후 되돌리기 110 · 가명만 162) → 끔 → 다시 가명 후 되돌리기
Away; Pump 300
$mark = LogMark
$shield = BarPointPx $place 'masking'
ClickAt $shield.x $shield.y
$menu = WaitLog $mark 'flyout.show' { $_.kind -eq 'masking-menu' } 2000
$r.masking_menu_shown = ($null -ne $menu)
$r.masking_menu_kept_focus = ((Fg).Title -eq 'SureMate-Test')
if ($menu) {
  Pump 400; ShotRect 'm5-masking-menu' $menu.bounds $scale
  ClickMenuRow $menu 58 $scale
  $r.masking_set_off = WaitSetting { param($s) $s.masking.mode -eq 'off' } 3000
  Away; Pump 800
  ShotRect 'm5-bar-masking-off' (AroundBar $place) $scale
  $mark = LogMark
  ClickAt $shield.x $shield.y
  $menu2 = WaitLog $mark 'flyout.show' { $_.kind -eq 'masking-menu' } 2000
  if ($menu2) { Pump 300; ClickMenuRow $menu2 110 $scale }
  $r.masking_set_restore = WaitSetting { param($s) $s.masking.mode -eq 'restore' } 3000
}

# 4. 로고에 0.6초 → 이름표, 0.3초만 → 이름표 없음(앞 이름표가 사라지고 이어 보이기 시간이 지난 뒤)
Away; Pump 1200
$mark = LogMark
$logo = BarPointPx $place 'logo'
HoverAt $logo.x $logo.y; Pump 600
$label = WaitLog $mark 'flyout.show' { $_.kind -eq 'label' } 300
$r.label_after_600ms = ($null -ne $label)
if ($label) { Pump 200; ShotRect 'm5-label' $label.bounds $scale }
Away; Pump 1200
$mark = LogMark
$gear = BarPointPx $place 'settings'
HoverAt $gear.x $gear.y; Pump 300; Away; Pump 600
$r.no_label_after_300ms = (@(LogsAfter $mark 'flyout.show' | Where-Object { $_.kind -eq 'label' }).Count -eq 0)

# 5. "MC/DC" 선택 → 조회 단축키(보조키 0.3초 늦게 떼기) → 위키 카드(가장 맞는 용어), 앞 창 그대로 → 8초 뒤 저절로 닫힘
FocusTest
$word = 'MC/DC'; $ws = $tb.Text.IndexOf($word); $tb.Select($ws, $word.Length); Pump 200
$lookupKey = try { (ReadSettings).hotkeys.lookup } catch { $null }
if (-not $lookupKey) { $lookupKey = 'Ctrl+Alt+W' }
$mark = LogMark
HoldCombo $lookupKey 300
$wc = WaitLog $mark 'wiki.card' { $true } 5000
$r.wiki_card_best = ($null -ne $wc -and $wc.kind -eq 'best' -and $wc.source -eq 'selection')
$r.info_wiki_card = if ($wc) { 'method={0} {1}ms restored={2} length={3} count={4}' -f $wc.method, $wc.elapsedMs, $wc.restored, $wc.length, $wc.count } else { 'none' }
$card = WaitLog $mark 'flyout.show' { $_.kind -eq 'wiki-card' } 2000
$r.wiki_card_shown = ($null -ne $card)
$r.wiki_card_kept_focus = ((Fg).Title -eq 'SureMate-Test')
if ($card) { Pump 400; ShotRect 'm5-wiki-card' $card.bounds $scale }
$hide = WaitLog $mark 'flyout.hide' { $_.kind -eq 'wiki-card' } 11000
$r.wiki_card_timeout = ($null -ne $hide -and $hide.reason -eq 'timeout')
$r.wiki_selection_kept = ($tb.SelectionStart -eq $ws -and $tb.SelectionLength -eq $word.Length)

# 6. 전체 화면 창이 앞에 오면 바가 숨고(1초마다 확인), 닫으면 다시 보인다
$full = New-Object System.Windows.Forms.Form
$full.Text = 'SureMate-Fullscreen'; $full.ControlBox = $false; $full.FormBorderStyle = 'None'; $full.StartPosition = 'Manual'; $full.ShowInTaskbar = $false
$full.Bounds = $scr.Bounds; $full.BackColor = [System.Drawing.Color]::FromArgb(24, 26, 34)
$mark = LogMark
$t0 = Get-Date
$full.Show(); Key 0x12; [void][W]::SetForegroundWindow($full.Handle); Key 0x12 -Up; $full.Activate()
$hid = WaitLog $mark 'bar.visibility' { $_.visible -eq $false -and $_.reason -eq 'fullscreen' } 3000
$hideMs = [int]((Get-Date) - $t0).TotalMilliseconds
$r.fullscreen_hides_bar = ($null -ne $hid)
$mark = LogMark
$t1 = Get-Date
$full.Close(); FocusTest
$back = WaitLog $mark 'bar.visibility' { $_.visible -eq $true } 3000
$showMs = [int]((Get-Date) - $t1).TotalMilliseconds
$r.fullscreen_close_shows_bar = ($null -ne $back)
$r.fullscreen_within_1_1s = ($null -ne $hid -and $null -ne $back -and $hideMs -le 1100 -and $showMs -le 1100)
$r.info_fullscreen_ms = 'hide={0} show={1}' -f $hideMs, $showMs

# 7. 다른 맨 앞(topmost) 창이 바를 덮어도 2초 안에 바가 다시 맨 위(작업 표시줄을 누른 것과 같은 상황, 2초마다 다시 올림)
Pump 600
$cover = New-Object System.Windows.Forms.Form
$cover.Text = 'SureMate-Cover'; $cover.ControlBox = $false; $cover.FormBorderStyle = 'None'; $cover.StartPosition = 'Manual'; $cover.ShowInTaskbar = $false; $cover.TopMost = $true
$cover.Bounds = New-Object System.Drawing.Rectangle ([int](($place.bounds.x - 40) * $scale)), ([int]($place.bounds.y * $scale)), ([int](($place.bounds.width + 40) * $scale)), ([int](120 * $scale))
$cover.BackColor = [System.Drawing.Color]::FromArgb(247, 248, 250)
$cover.Show(); Pump 100
$r.info_topmost_after_cover = TopmostOverBar $place
$t2 = Get-Date; $regained = $false
while (((Get-Date) - $t2).TotalMilliseconds -lt 2600 -and -not $regained) { Pump 100; $regained = TopmostIsApp $place }
$r.topmost_regained_2s = $regained
$r.info_topmost_ms = [int]((Get-Date) - $t2).TotalMilliseconds
$cover.Close(); FocusTest

# 8. 바 빈 곳(첫 구분선) 오른쪽 클릭 → 바 메뉴(행: 가장자리 띠 48 · 떠 있는 캡슐 80) → 캡슐 → 다시 가장자리 띠
Away; Pump 300
$mark = LogMark
$sep = BarPointPx $place 'sep1'
ClickAt $sep.x $sep.y -Right
$barMenu = WaitLog $mark 'flyout.show' { $_.kind -eq 'bar-menu' } 2000
$r.bar_menu_shown = ($null -ne $barMenu)
if ($barMenu) {
  Pump 300; ShotRect 'm5-bar-menu' $barMenu.bounds $scale
  ClickMenuRow $barMenu 80 $scale
  $cap = WaitLog $mark 'bar.place' { $_.shape -eq 'capsule' } 3000
  $r.capsule_placed = ($null -ne $cap)
  if ($cap) {
    Away; Pump 800
    ShotRect 'm5-bar-capsule' (AroundBar $cap 24) $scale
    $mark = LogMark
    $capSep = BarPointPx $cap 'sep1'
    ClickAt $capSep.x $capSep.y -Right
    $barMenu2 = WaitLog $mark 'flyout.show' { $_.kind -eq 'bar-menu' } 2000
    if ($barMenu2) { Pump 300; ClickMenuRow $barMenu2 48 $scale }
    $r.back_to_edge = ($null -ne (WaitLog $mark 'bar.place' { $_.shape -eq 'edge' } 3000))
  }
}
$r.bar_shape_saved_edge = WaitSetting { param($s) $s.bar.shape -eq 'edge' } 2000

# 9. 바 빈 곳을 아래로 120 DIP 끌기 → 바가 120 내려가고 주 모니터 비율이 저장된다
Away; Pump 600
$now = LastBarPlace
$mark = LogMark
$sep = BarPointPx $now 'sep1'
DragBy $sep.x $sep.y ([int][Math]::Round(120 * $scale))
$moved = WaitLog $mark 'bar.place' { $true } 2000
$r.drag_moved_120 = ($null -ne $moved -and [Math]::Abs(($moved.bounds.y - $now.bounds.y) - 120) -le 1)
$r.info_drag = if ($moved) { 'y {0} -> {1}' -f $now.bounds.y, $moved.bounds.y } else { 'none' }
$r.drag_saved_position = WaitSetting { param($s) @($s.bar.positions).Count -ge 1 } 2000

# 11. 로그에 선택 글·프롬프트·용어 이름이 없다. 참고값: 메모리(작업 집합 합), 바만 떠 있는 30초 CPU
Away
$appLines = @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $startLines) -join "`n"
$r.log_has_no_content = -not ($appLines.Contains('브레이크') -or $appLines.Contains('주간 회의') -or $appLines.Contains('MC/DC') -or $appLines.Contains('회의록 정리'))
$r.log_has_no_typed_text = -not ($appLines -match '"(text|query|definition|selection)":')
function AppProcs { @(Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$desktopDir*" }) }
$procs = AppProcs
$r.info_memory_mb = [int](($procs | Measure-Object WorkingSet64 -Sum).Sum / 1MB)
$cpu0 = ($procs | ForEach-Object { $_.TotalProcessorTime.TotalMilliseconds } | Measure-Object -Sum).Sum
Pump 30000
$cpu1 = (AppProcs | ForEach-Object { $_.TotalProcessorTime.TotalMilliseconds } | Measure-Object -Sum).Sum
$r.info_idle_cpu_percent = [Math]::Round(($cpu1 - $cpu0) / (30000 * [Environment]::ProcessorCount) * 100, 2)

$form.Close()
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
