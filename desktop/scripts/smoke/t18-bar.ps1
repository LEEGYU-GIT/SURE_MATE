# M5 바·펼침 창·위키 카드 (설계 §14-1·§9 완료 기준 순서). t18-run.ps1로 돌린다(설정을 잠시 바꾸고 되돌림).
# -AutoHide: 자동 숨김 손잡이만 확인한다(설정의 bar.autoHide가 true여야 한다).
# 좌표: 로그의 bar.place 사각형은 DIP, 마우스와 캡처는 물리 픽셀(= DIP x 배율, 주 모니터 기준).
param([string]$Combo = 'Alt+`', [switch]$AutoHide)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$desktop = (Resolve-Path "$PSScriptRoot\..\..").Path
$settingsPath = Join-Path $env:APPDATA 'Sure-Mate\settings.json'
$scr = [System.Windows.Forms.Screen]::PrimaryScreen
$wa = $scr.WorkingArea
$form = $null

function ReadSettings { Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json }
function WaitSetting([scriptblock]$test, [int]$ms) {
  $end = (Get-Date).AddMilliseconds($ms)
  do {
    try { $s = ReadSettings; if (& $test $s) { return $true } } catch { }
    Pump 100
  } while ((Get-Date) -lt $end)
  return $false
}
function ClipText {
  try { return [System.Windows.Forms.Clipboard]::GetText() } catch { Pump 200 }
  try { return [System.Windows.Forms.Clipboard]::GetText() } catch { return $null }
}
function ParkMouse { [void][W]::SetCursorPos(150, 150); Pump 100 }
function FocusForm { Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); $tb.Focus(); Pump 300 }
function InTestForm { return ((Fg).Title -eq 'SureMate-Test') }
function RectText($b) { return ("x={0} y={1} w={2} h={3}" -f $b.x, $b.y, $b.width, $b.height) }

# 바 항목 중심(DIP): 로고, 가명 처리 | 고정 프롬프트 n개 | 워크스페이스, 용어 사전 | 펫, 설정. 구분선 sep1~
# 높이/간격: 띠는 위 여백 8·칸 40, 캡슐은 위 여백 12·칸 36, 구분선 12, 간격 4 (BAR_METRICS)
function BarLayout($pl) {
  $edgeShape = ($pl.shape -eq 'edge')
  $cell = if ($edgeShape) { 40 } else { 36 }
  $pad = if ($edgeShape) { 8 } else { 12 }
  $n = [int]$pl.items
  $p = [math]::Max(0, $n - 9)
  $kinds = @('logo', 'masking')
  if ($p -gt 0) { $kinds += 'sep'; for ($i = 1; $i -le $p; $i++) { $kinds += "prompt$i" } }
  $kinds += @('sep', 'workspace', 'glossary', 'sep', 'pet', 'settings')
  $items = @{}; $y = $pad; $sum = 0; $sepN = 0
  foreach ($k in $kinds) {
    $h = $cell; $name = $k
    if ($k -eq 'sep') { $h = 12; $sepN++; $name = "sep$sepN" }
    $items[$name] = [pscustomobject]@{ Cy = $pl.bounds.y + $y + $h / 2 }
    $y += $h + 4; $sum += $h
  }
  $total = 2 * $pad + $sum + 4 * ($kinds.Count - 1)
  [pscustomobject]@{ Items = $items; Cx = $pl.bounds.x + $pl.bounds.width / 2; HeightOk = ($total -eq [int]$pl.bounds.height); Count = $kinds.Count }
}
# 메뉴 창(flyout.show의 bounds)에서 카드 사각형: 바 반대쪽 세 면에 그림자 여백(위 16·옆 24·아래 32)
function MenuCard($b, [string]$edge) {
  $left = if ($edge -eq 'right') { 24 } else { 0 }
  $right = if ($edge -eq 'right') { 0 } else { 24 }
  [pscustomobject]@{ x = $b.x + $left; y = $b.y + 16; width = $b.width - 24; height = $b.height - 16 - 32 }
}
function WindowRectNow($pl) {
  $h = $pl.bounds.height * $sc
  return (BarWindowRect $h $wa.Right)
}

try {
  $place = LastBarPlace
  if ($null -eq $place) { throw 'no bar.place log in this session' }
  $sc = [double]$place.scale
  $r.scale = $sc
  $r.screen_px = "{0}x{1} work_area_right_px={2}" -f $scr.Bounds.Width, $scr.Bounds.Height, $wa.Right
  $r.no_mismatch = (@(SessionLogs 'bar.place.mismatch').Count -eq 0)

  if (-not $AutoHide) {
    # ---- 1. 가장자리 띠 배치 ----
    $r.bar_rect = RectText $place.bounds
    $r.bar_width_56 = ($place.bounds.width -eq 56 -and $place.shape -eq 'edge')
    $lay = BarLayout $place
    $r.layout_height_matches = $lay.HeightOk
    $r.bar_items = $place.items
    $wr = WindowRectNow $place
    $r.bar_window_width_px = if ($wr) { $wr.Width } else { 'not found' }
    $r.cap_bar_edge = ShotRect 'm5-bar-edge' $place.bounds $sc

    # ---- 시험 창: 가짜 회의 메모 ----
    [System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')
    $selText = '다음 주 화요일까지 시험 항목 정리'
    $memo = "가상 회의 메모`r`n안건: 시험 일정 점검`r`n결정: $selText`r`nMC/DC 기준은 별도 확인"
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'SureMate-Test'; $form.ControlBox = $false; $form.Width = 620; $form.Height = 260; $form.StartPosition = 'CenterScreen'
    $tb = New-Object System.Windows.Forms.TextBox
    $tb.Multiline = $true; $tb.AcceptsReturn = $true; $tb.Width = 580; $tb.Height = 180; $tb.Left = 10; $tb.Top = 10; $tb.Text = $memo
    $form.Controls.Add($tb)
    $form.Show(); Pump 300
    ParkMouse
    FocusForm

    # ---- 2. 고정 프롬프트: 선택한 글로 바로 실행 ----
    $selStart = $memo.IndexOf($selText)
    $tb.Select($selStart, $selText.Length); Pump 200
    $n0 = LogCount 'prompt.bar'
    ClickAt (Px $lay.Cx $sc) (Px ($lay.Items['prompt1'].Cy) $sc)
    $pb = WaitLog 'prompt.bar' $n0 5000
    Pump 600
    $r.prompt_bar_ran = ($null -ne $pb -and $pb.result -eq 'ran')
    $r.prompt_bar_selection_length = ($null -ne $pb -and $pb.selectionLength -eq $selText.Length)
    $r.prompt_bar_template = if ($pb) { $pb.templateId } else { $null }
    $clip = ClipText
    $r.clipboard_has_selection = ($null -ne $clip -and $clip.Contains($selText))
    $r.textbox_selection_kept = ($tb.SelectionStart -eq $selStart -and $tb.SelectionLength -eq $selText.Length)
    $r.foreground_after_prompt_is_test = InTestForm

    # ---- 3. 가명 처리 메뉴 ----
    $n0 = LogCount 'flyout.show'
    ClickAt (Px $lay.Cx $sc) (Px ($lay.Items['masking'].Cy) $sc)
    $fm = WaitLog 'flyout.show' $n0 3000 @{ kind = 'masking-menu' }
    Pump 500
    $r.masking_menu_shown = ($null -ne $fm)
    $r.foreground_after_menu_is_test = InTestForm
    if ($fm) {
      $r.cap_masking_menu = ShotRect 'm5-masking-menu' (UnionRect $fm.bounds $place.bounds) $sc
      $card = MenuCard $fm.bounds $place.edge
      # 머리 28 + 행 52 x 순서(끔, 가명 후 되돌리기, 결과에서 빼기), 안쪽 여백 4
      ClickAt (Px ($card.x + $card.width / 2) $sc) (Px ($card.y + 4 + 28 + 26) $sc)
      $r.masking_off_saved = WaitSetting { param($s) $s.masking.mode -eq 'off' } 3000
      Pump 700
      $r.cap_bar_masking_off = ShotRect 'm5-bar-masking-off' $place.bounds $sc
      # 다시 가명 후 되돌리기
      $n0 = LogCount 'flyout.show'
      ClickAt (Px $lay.Cx $sc) (Px ($lay.Items['masking'].Cy) $sc)
      $fm2 = WaitLog 'flyout.show' $n0 3000 @{ kind = 'masking-menu' }
      if ($fm2) {
        $card = MenuCard $fm2.bounds $place.edge
        ClickAt (Px ($card.x + $card.width / 2) $sc) (Px ($card.y + 4 + 28 + 52 + 26) $sc)
      }
      $r.masking_restore_saved = WaitSetting { param($s) $s.masking.mode -eq 'restore' } 3000
      Pump 500
    }

    # ---- 4. 이름표: 0.6초 올리면 나오고 0.3초면 나오지 않음 ----
    $n0 = LogCount 'flyout.show'
    HoverAt (Px $lay.Cx $sc) (Px ($lay.Items['logo'].Cy) $sc)
    Pump 600
    $fl = WaitLog 'flyout.show' $n0 1000 @{ kind = 'label' }
    $r.label_shown_after_600ms = ($null -ne $fl)
    if ($fl) { $r.cap_label = ShotRect 'm5-label' (UnionRect $fl.bounds $place.bounds) $sc }
    ParkMouse; Pump 1200
    $n0 = LogCount 'flyout.show'
    HoverAt (Px $lay.Cx $sc) (Px ($lay.Items['logo'].Cy) $sc)
    Pump 300
    ParkMouse; Pump 900
    $r.label_not_shown_after_300ms = ((LogCount 'flyout.show') -eq $n0)

    # ---- 5. 위키 카드: MC/DC 선택 -> Ctrl+Alt+W(보조키 0.3초 늦게 떼기) ----
    [System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')
    FocusForm
    $termStart = $memo.IndexOf('MC/DC')
    $tb.Select($termStart, 5); Pump 200
    $nCard = LogCount 'wiki.card'; $nShow = LogCount 'flyout.show'; $nHide = LogCount 'flyout.hide'
    Key 0x11; Key 0x12; Tap 0x57; Pump 300; Key 0x12 -Up; Key 0x11 -Up
    $wc = WaitLog 'wiki.card' $nCard 4000
    $t0 = Get-Date
    $r.wiki_card_kind_best = ($null -ne $wc -and $wc.kind -eq 'best')
    if ($wc) { $r.wiki_card_capture = "method={0} elapsedMs={1} restored={2} skipped={3} length={4} count={5}" -f $wc.method, $wc.elapsedMs, $wc.restored, $wc.skipped, $wc.length, $wc.count }
    $r.wiki_card_length_5 = ($null -ne $wc -and $wc.length -eq 5)
    $fc = WaitLog 'flyout.show' $nShow 3000 @{ kind = 'wiki-card' }
    Pump 500
    $r.wiki_card_shown = ($null -ne $fc)
    $r.card_kept_focus = InTestForm
    $r.clipboard_restored_after_card = ((ClipText) -eq 'ORIGINAL-CLIP')
    if ($fc) { $r.cap_wiki_card = ShotRect 'm5-wiki-card' (UnionRect $fc.bounds $place.bounds) $sc }
    $hd = WaitLog 'flyout.hide' $nHide 9500 @{ kind = 'wiki-card'; reason = 'timeout' }
    $r.wiki_card_timeout_hide = ($null -ne $hd)
    $r.wiki_card_visible_seconds = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)

    # ---- 6. 전체 화면 창이 앞에 오면 바가 숨고, 닫으면 다시 나타남(1초마다 확인 + 0.1초 여유) ----
    $nVis = LogCount 'bar.visibility'
    $fs = New-Object System.Windows.Forms.Form
    $fs.Text = 'SureMate-Fullscreen'; $fs.FormBorderStyle = 'None'; $fs.StartPosition = 'Manual'; $fs.Bounds = $scr.Bounds; $fs.BackColor = [System.Drawing.Color]::Black
    $fs.Show()
    Key 0x12; [void][W]::SetForegroundWindow($fs.Handle); Key 0x12 -Up; $fs.Activate()
    $t0 = Get-Date
    $hv = WaitLog 'bar.visibility' $nVis 1100 @{ visible = $false; reason = 'fullscreen' }
    $r.fullscreen_hides_bar_in_1100ms = ($null -ne $hv)
    $r.fullscreen_hide_ms = [int]((Get-Date) - $t0).TotalMilliseconds
    $nVis = LogCount 'bar.visibility'
    $fs.Close(); $fs.Dispose()
    $t0 = Get-Date
    $sv = WaitLog 'bar.visibility' $nVis 1100 @{ visible = $true }
    $r.bar_returns_in_1100ms = ($null -ne $sv)
    $r.bar_return_ms = [int]((Get-Date) - $t0).TotalMilliseconds
    Pump 500
    FocusForm

    # ---- 7. 작업 표시줄 빈 곳을 누르면 2초 안에 바가 다시 맨 위 ----
    if ($wa.Bottom -lt $scr.Bounds.Bottom) {
      $tx = [int]($scr.Bounds.Left + $scr.Bounds.Width * 0.7)
      $ty = [int](($wa.Bottom + $scr.Bounds.Bottom) / 2)
      $r.topmost_before_click = TopmostIsApp
      ClickAt $tx $ty
      Pump 150
      # 작업 표시줄이 바 위로 올라왔는지(올라오지 않았다면 이 시험은 의미가 적다)
      $r.taskbar_rose_over_bar = -not (TopmostIsApp)
      $t0 = Get-Date; $back = $false
      while (((Get-Date) - $t0).TotalMilliseconds -lt 2000) { if (TopmostIsApp) { $back = $true; break }; Pump 100 }
      $r.topmost_back_within_2s = $back
      $r.topmost_back_ms = [int]((Get-Date) - $t0).TotalMilliseconds + 150
      FocusForm
    } else {
      $r.topmost_back_within_2s = 'skipped: taskbar is not at the bottom'
    }

    # ---- 8. 바 메뉴(오른쪽 클릭) -> 떠 있는 캡슐 -> 다시 가장자리 띠 ----
    $place = LastBarPlace; $lay = BarLayout $place
    $n0 = LogCount 'flyout.show'
    ClickAt (Px $lay.Cx $sc) (Px ($lay.Items['sep1'].Cy) $sc) -Right
    $bm = WaitLog 'flyout.show' $n0 3000 @{ kind = 'bar-menu' }
    $r.bar_menu_shown = ($null -ne $bm)
    if ($bm) {
      $card = MenuCard $bm.bounds $place.edge
      $np = LogCount 'bar.place'
      # 머리 28 다음: 가장자리 띠(32), 떠 있는 캡슐(32), 바 끄기(52) ...
      ClickAt (Px ($card.x + $card.width / 2) $sc) (Px ($card.y + 4 + 28 + 32 + 16) $sc)
      $cp = WaitLog 'bar.place' $np 3000 @{ shape = 'capsule' }
      Pump 800
      $r.capsule_width_44 = ($null -ne $cp -and $cp.bounds.width -eq 44)
      if ($cp) { $r.cap_bar_capsule = ShotRect 'm5-bar-capsule' $cp.bounds $sc }
      # 다시 가장자리 띠
      $place = LastBarPlace; $lay = BarLayout $place
      $n0 = LogCount 'flyout.show'
      ClickAt (Px $lay.Cx $sc) (Px ($lay.Items['sep1'].Cy) $sc) -Right
      $bm2 = WaitLog 'flyout.show' $n0 3000 @{ kind = 'bar-menu' }
      if ($bm2) {
        $card = MenuCard $bm2.bounds $place.edge
        $np = LogCount 'bar.place'
        ClickAt (Px ($card.x + $card.width / 2) $sc) (Px ($card.y + 4 + 28 + 16) $sc)
        $ep = WaitLog 'bar.place' $np 3000 @{ shape = 'edge' }
        $r.edge_again_width_56 = ($null -ne $ep -and $ep.bounds.width -eq 56)
      } else { $r.edge_again_width_56 = $false }
      Pump 600
    }

    # ---- 9. 바 빈 곳을 아래로 120 DIP 끌기 ----
    $place = LastBarPlace; $lay = BarLayout $place
    $waBottomDip = $wa.Bottom / $sc
    $dirn = 1
    if (($place.bounds.y + 120 + $place.bounds.height + 12) -gt $waBottomDip) { $dirn = -1 }
    $r.drag_direction = if ($dirn -eq 1) { 'down' } else { 'up (not enough room below)' }
    $np = LogCount 'bar.place'
    DragBy (Px $lay.Cx $sc) (Px ($lay.Items['sep1'].Cy) $sc) (Px (120 * $dirn) $sc)
    $dp = WaitLog 'bar.place' $np 3000
    Pump 500
    $r.drag_bar_place_logged = ($null -ne $dp)
    if ($dp) {
      $delta = $dp.bounds.y - $place.bounds.y
      $r.drag_delta_dip = $delta
      $r.drag_moved_120 = ([math]::Abs($delta - 120 * $dirn) -le 1)
      $min = $wa.Y / $sc + 12; $span = $wa.Height / $sc - $dp.bounds.height - 24
      $ratio = if ($span -gt 0) { ($dp.bounds.y - $min) / $span } else { 0 }
      $disp = "$($dp.display)"
      $r.position_saved_ratio = WaitSetting { param($s) $hit = @($s.bar.positions | Where-Object { "$($_.display)" -eq $disp }); ($hit.Count -gt 0 -and [math]::Abs([double]$hit[-1].ratio - $ratio) -le 0.01) } 3000
      $r.expected_ratio = [math]::Round($ratio, 3)
    }

    # ---- 11. 참고값: 메모리, 바만 떠 있는 30초 CPU ----
    ParkMouse; Pump 1500
    $procs = @(Get-Process | Where-Object { $_.Name -eq 'Sure-Mate' -or ($_.Name -eq 'electron' -and $_.Path -like "$desktop*") })
    $r.memory_mb = [math]::Round((($procs | Measure-Object -Property WorkingSet64 -Sum).Sum) / 1MB)
    $cpu0 = @{}
    foreach ($p in $procs) { try { $cpu0[$p.Id] = $p.TotalProcessorTime.TotalSeconds } catch { } }
    $tStart = Get-Date
    Pump 30000
    $secs = ((Get-Date) - $tStart).TotalSeconds
    $used = 0.0
    foreach ($p in @(Get-Process | Where-Object { $_.Name -eq 'Sure-Mate' -or ($_.Name -eq 'electron' -and $_.Path -like "$desktop*") })) {
      try { if ($cpu0.ContainsKey($p.Id)) { $used += $p.TotalProcessorTime.TotalSeconds - $cpu0[$p.Id] } } catch { }
    }
    $r.idle_cpu_percent = [math]::Round($used / $secs / [Environment]::ProcessorCount * 100, 2)
    $r.process_count = $procs.Count
  } else {
    # ---- 10. 자동 숨김 손잡이 ----
    $lay = BarLayout $place
    $hPx = $place.bounds.height * $sc
    $cy = Px ($place.bounds.y + $place.bounds.height / 2) $sc
    $hx = $wa.Right - [int]($sc * 3)
    # 먼저 한 번 꺼내 두었다가 밖으로 나가 접히는 것을 확인한다
    HoverAt $hx $cy; Pump 700
    ParkMouse; Pump 1500
    $w = WindowRectNow $place
    $r.handle_found = ($null -ne $w)
    if ($w) {
      $r.handle_width_px = $w.Width
      $r.handle_width_6dip = ([math]::Abs($w.Width - 6 * $sc) -le 2)
      $r.handle_at_work_area_end = ([math]::Abs($w.Right - $wa.Right) -le 2)
    }
    $hr = [pscustomobject]@{ x = $wa.Right / $sc - 70; y = $place.bounds.y; width = 70; height = $place.bounds.height }
    $r.cap_bar_handle = ShotRect 'm5-bar-handle' $hr $sc
    # 0.4초 올리면 펼쳐진다
    HoverAt $hx $cy; Pump 400
    $w = WindowRectNow $place
    if ($null -eq $w) { Pump 250; $w = WindowRectNow $place }
    $r.hover_400ms_expands_to_56 = ($null -ne $w -and [math]::Abs($w.Width - 56 * $sc) -le 2)
    ParkMouse; Pump 1700
    $w = WindowRectNow $place
    $r.collapsed_again = ($null -ne $w -and [math]::Abs($w.Width - 6 * $sc) -le 2)
    # 0.2초만 올리면 그대로
    HoverAt $hx $cy; Pump 200
    ParkMouse; Pump 900
    $w = WindowRectNow $place
    $r.hover_200ms_stays_6 = ($null -ne $w -and [math]::Abs($w.Width - 6 * $sc) -le 2)
    # bar.place는 자동 숨김 이동을 기록하지 않는다(placeWindow(false)). 참고로 마지막 줄만 남긴다
    $last = LastBarPlace
    $r.last_bar_place_log_info = RectText $last.bounds
  }

  # ---- 11. 로그에 선택 글·프롬프트·용어 이름이 없음 ----
  $names = @()
  $prompts = Get-Content (Join-Path $desktop 'resources\prompts.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($t in $prompts.templates) { if ($t.kind -eq 'prompt') { $names += $t.name } }
  $names += @('다음 주 화요일', '시험 항목 정리', 'MC/DC', '가상 회의 메모')
  $glossary = Get-Content (Join-Path $desktop 'resources\glossary.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $names += @($glossary.entries | Where-Object { $_.id -eq 'mcdc' } | ForEach-Object { $_.term })
  $mine = @(SessionLines | Where-Object { $_ -match '"event":"(prompt\.bar|wiki\.card|flyout\.|bar\.)' })
  $joined = $mine -join "`n"
  $leak = @($names | Where-Object { $_ -and $joined.Contains($_) })
  $r.log_lines_checked = $mine.Count
  $r.log_has_no_content = ($leak.Count -eq 0)
  $r.no_mismatch_at_end = (@(SessionLogs 'bar.place.mismatch').Count -eq 0)
} catch {
  $r.error = "$_ at line $($_.InvocationInfo.ScriptLineNumber)"
} finally {
  if ($form) { $form.Close() }
  $r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
}
