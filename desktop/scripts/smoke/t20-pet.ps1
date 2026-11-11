# M6 말랑 메이트(설계 §14-2 완료 기준). t20-run.ps1로 실행한다(AI 대상 "복사만", 오른쪽 가장자리 띠 바, 펫 설정 값, 가상 가명 사전으로 잠시 바꾸고 되돌림).
# 좌표는 앱 로그(pet.state·bar.place)의 DIP에 배율을 곱한 물리 픽셀(주 모니터). 판정 줄은 README "t20 결과를 눈으로 확인할 곳".
# 로그 읽기: pet.state(mode climb·sit·sleep·wake·held·land, box·window), pet.click, pet.react, pet.menu, pet.control, pet.close, pet.visibility,
# palette.show, prompt.bar, bar.place, flyout.show. 앱이 로그로 알리지 않는 펫 위치는 펫 창(320x240 DIP)을 크기로 찾아 읽는다(smoke-lib PetNow).
# 단계가 예외로 멈추면 그 단계만 `error_단계` 줄을 남기고 다음 단계로 간다. 판정 줄이 없거나 `error`로 시작하는 줄이 있으면 실패다(README).
# 같은 자리를 연속 클릭하는 시험은 ClickAt이 0.7초 이상 띄운다(바 단추는 운영 체제 두 번 클릭의 두 번째를 무시). 펫 두 번 클릭만 0.15초 간격으로 직접 보낸다.
# -IdleMinutes N: 시험 창 없이 N분 동안 입력하지 않고 앱 전체 CPU와 졺만 잰다(t20-run.ps1 -Idle).
param([string]$Combo = 'Alt+`', [int]$IdleMinutes = 0)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
$r = [ordered]@{}
$settingsPath = Join-Path $env:APPDATA 'Sure-Mate\settings.json'
$size = 56
$scr = [System.Windows.Forms.Screen]::PrimaryScreen
$away = [pscustomobject]@{ x = [int]($scr.Bounds.Width * 0.4); y = [int]($scr.Bounds.Height * 0.5) }
function Away { MoveTo $away.x $away.y }
function ReadSettings { Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json }
function WaitSetting([scriptblock]$ok, [int]$timeoutMs) {
  $end = (Get-Date).AddMilliseconds($timeoutMs)
  do { try { if (& $ok (ReadSettings)) { return $true } } catch { }; Pump 100 } while ((Get-Date) -lt $end)
  return $false
}
# 보조키를 누른 채 키를 누르고, 보조키는 lateMs 늦게 뗀다(사람 손 타이밍)
function HoldCombo([string]$acc, [int]$lateMs) {
  $t = $acc.ToLower().Split('+'); $mods = @($t[0..($t.Count - 2)] | ForEach-Object { VkOf $_ })
  foreach ($m in $mods) { Key $m; Pump 40 }
  Tap (VkOf $t[-1]); Pump $lateMs
  foreach ($m in $mods[($mods.Count - 1)..0]) { Key $m -Up; Pump 20 }
}
# 방향키를 totalMs 동안 누른다: 처음 누름, 0.5초 뒤부터 33ms 간격 자동 반복, 뗌
function HoldArrow([byte]$vk, [int]$totalMs) {
  ExtKey $vk; $t0 = Get-Date; Pump 500
  while (((Get-Date) - $t0).TotalMilliseconds -lt $totalMs) { ExtKey $vk; Pump 33 }
  ExtKey $vk -Up
}
function TapHuman([byte]$vk) { Key $vk; Pump 90; Key $vk -Up }
function ClockMs($later, $earlier) { return [int]($later - $earlier).TotalMilliseconds }
function WholeScreenDip { [pscustomobject]@{ x = 0; y = 0; width = [Math]::Floor($scr.Bounds.Width / $scale); height = [Math]::Floor($scr.Bounds.Height / $scale) } }
# 펫 창을 캡처한다(창 안에 말풍선·메뉴 자리가 모두 있다). 창을 못 찾으면 화면 전체
function PetShot([string]$name) {
  $w = PetWindowRect $scale
  if ($w) { ShotRect $name $w $scale } else { ShotRect $name (WholeScreenDip) $scale }
}
# 작업 표시줄의 빈 곳(작업 표시줄 쪽 가장자리에서 6픽셀 안, 아래·위는 폭 68%, 옆은 높이 68% 지점). 자동 숨김이면 $null
function TaskbarBlankPoint {
  $b = $scr.Bounds; $wa = $scr.WorkingArea
  if ($wa.Bottom -lt $b.Bottom) { return [pscustomobject]@{ x = [int]($b.Left + $b.Width * 0.68); y = [int]($b.Bottom - 6) } }
  if ($wa.Top -gt $b.Top) { return [pscustomobject]@{ x = [int]($b.Left + $b.Width * 0.68); y = [int]($b.Top + 6) } }
  if ($wa.Left -gt $b.Left) { return [pscustomobject]@{ x = [int]($b.Left + 6); y = [int]($b.Top + $b.Height * 0.68) } }
  if ($wa.Right -lt $b.Right) { return [pscustomobject]@{ x = [int]($b.Right - 6); y = [int]($b.Top + $b.Height * 0.68) } }
  return $null
}
# 펫 몸 가운데(DIP)에 마우스를 올려 클릭 통과가 풀릴 시간(조회 34~100ms)을 준 뒤 누른다. -Right면 오른쪽 클릭
function PetClick($c, [switch]$Right) {
  $px = [int][Math]::Round($c.x * $scale); $py = [int][Math]::Round($c.y * $scale)
  HoverAt $px $py; Pump 250
  if ($Right) { ClickAt $px $py -Right } else { ClickAt $px $py }
}
# 펫 몸을 0.15초 간격으로 두 번 누른다(앱의 두 번 클릭 간격 0.5초 안). ClickAt의 0.7초 띄우기는 쓰지 않는다
function PetDoubleClick($c) {
  $px = [int][Math]::Round($c.x * $scale); $py = [int][Math]::Round($c.y * $scale)
  HoverAt $px $py; Pump 300
  [W]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Pump 60
  [W]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero); Pump 150
  [W]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Pump 60
  [W]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}
# 시험 창을 앞으로(Alt 단독 입력의 메뉴 모드를 피하려고 ControlBox를 끈 창에 Alt 누름·뗌을 보낸다)
function FocusForm { Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); $tb.Focus(); Pump 300 }
# 시험 창을 펫 창 위에 놓는다: 창이 펫 창 사각형을 덮고, 단추는 펫 창 왼쪽 아래 구석에서 14 DIP 안쪽(펫 몸에서 먼 곳)에 있다
function PlaceForm($win) {
  $fw = 700; $fh = 420
  $left = [int][Math]::Round($win.x * $scale) - 20
  $top = [Math]::Max(0, [int][Math]::Round(($win.y + $win.height) * $scale) - $fh + 20)
  $form.Location = New-Object System.Drawing.Point $left, $top
  $form.Size = New-Object System.Drawing.Size $fw, $fh
  Pump 200
  $bx = [int][Math]::Round(($win.x + 14) * $scale); $by = [int][Math]::Round(($win.y + $win.height - 14) * $scale)
  $pt = $form.PointToClient((New-Object System.Drawing.Point $bx, $by))
  $btn.Location = New-Object System.Drawing.Point ($pt.X - 20), ($pt.Y - 14)
  Pump 200
}
function ClickButton {
  $p = $btn.PointToScreen((New-Object System.Drawing.Point ([int]($btn.Width / 2)), ([int]($btn.Height / 2))))
  ClickAt $p.X $p.Y
}
# 펫 메뉴를 연다(펫이 멈추길 기다려 몸 가운데를 오른쪽 클릭). 메뉴 사각형(DIP)을 돌려주고 그때의 펫 자리는 $script:menuNow
function OpenPetMenu {
  $now = WaitPetStill $scale 500 25000 $size
  if (-not $now) { return $null }
  $script:menuNow = $now
  PetClick (PetCenter $now) -Right
  Pump 350
  return (PetMenuRect $now.box $now.window $boundsDip)
}
function PetMenuRow($menu, [int]$row) {
  $p = PetMenuRowPoint $menu $row
  ClickAt ([int][Math]::Round($p.x * $scale)) ([int][Math]::Round($p.y * $scale))
}
# 메뉴 "조종하기"(첫 행)로 조종 모드를 시작한다. 시작 로그가 오면 $true
function StartControl {
  $mark = LogMark
  $menu = OpenPetMenu
  if (-not $menu) { return $false }
  PetMenuRow $menu 0
  return ($null -ne (WaitLog $mark 'pet.control' { $_.phase -eq 'start' } 2500))
}
# 메뉴 "숨기기"(셋째 행). 숨김 로그가 오면 $true
function HideViaMenu {
  $mark = LogMark
  $menu = OpenPetMenu
  if (-not $menu) { return $false }
  PetMenuRow $menu 2
  return ($null -ne (WaitLog $mark 'pet.visibility' { $_.visible -eq $false } 3000))
}
# 바의 펫 단추로 다시 부른다. 보임 로그(없으면 $null)
function RecallViaBar {
  $mark = LogMark
  $b = BarPointPx $barPlace 'pet'
  ClickAt $b.x $b.y
  return (WaitLog $mark 'pet.visibility' { $_.visible -eq $true } 4000)
}
# 펼침 창 메뉴 안 세로 위치(DIP)의 행을 누른다
function ClickMenuRow($flyout, [int]$rowCenter) {
  $c = MenuCard $flyout.bounds
  ClickAt ([int][Math]::Round(($c.x + $c.width / 2) * $scale)) ([int][Math]::Round(($c.y + $rowCenter) * $scale))
}
# 조종 중이면 Esc로 끝낸다(다음 단계가 깨끗이 시작하도록)
function EndControlIfAny {
  $mark = LogMark
  TapHuman 0x1B
  [void](WaitLog $mark 'pet.control' { $_.phase -eq 'end' } 1500)
  Pump 300
}

$form = $null; $full = $null
try {
  # 0. 바 배치(펫은 바가 있는 모니터에서만 다닌다). 배율은 바 로그의 값
  $barPlace = LastBarPlace
  if (-not $barPlace) { $r.bar_place_found = $false; throw '이번 실행의 bar.place 로그가 없다(바가 뜨지 않았다: 앱 로그의 bar.startError를 확인한다)' }
  $scale = [double]$barPlace.scale
  $boundsDip = [pscustomobject]@{ x = $scr.Bounds.X / $scale; y = $scr.Bounds.Y / $scale; width = $scr.Bounds.Width / $scale; height = $scr.Bounds.Height / $scale }
  $floorDip = $scr.WorkingArea.Bottom / $scale
  $r.bar_place_found = $true
  $r.info_bar = '{0} {1} x={2} y={3} w={4} h={5} scale={6} items={7}' -f $barPlace.shape, $barPlace.edge, $barPlace.bounds.x, $barPlace.bounds.y, $barPlace.bounds.width, $barPlace.bounds.height, $scale, $barPlace.items

  if ($IdleMinutes -gt 0) {
    # 10. 입력 없이 N분: 펫은 혼자 놀다 졸고(설정 3분), 앱 전체 CPU 초 증가를 논리 프로세서 수와 시간으로 나눈다(목표 1% 미만)
    Away; Pump 3000
    $idleMark = LogMark
    $cpu0 = CpuSeconds; $t0 = Get-Date
    Pump ($IdleMinutes * 60 * 1000)
    $cpu1 = CpuSeconds; $sec = ((Get-Date) - $t0).TotalSeconds
    $pct = [Math]::Round(($cpu1 - $cpu0) / ($sec * [Environment]::ProcessorCount) * 100, 2)
    $r.info_idle_cpu_percent = $pct
    $r.idle_cpu_under_1 = ($pct -lt 1)
    $r.info_idle = 'minutes={0} cpu_seconds={1} processors={2} processes={3}' -f $IdleMinutes, [Math]::Round($cpu1 - $cpu0, 2), [Environment]::ProcessorCount, @(AppProcs).Count
    $r.pet_slept_during_idle = (@(LogsAfter $idleMark 'pet.state' | Where-Object { $_.mode -eq 'sleep' }).Count -ge 1)
    $r.info_memory_mb = [int]((@(AppProcs) | Measure-Object WorkingSet64 -Sum).Sum / 1MB)
    $r.info_private_mb = [int]((@(AppProcs) | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB)
    $r.pet_no_errors = (@(SinceAppReady 'pet.error').Count -eq 0 -and @(SinceAppReady 'pet.startError').Count -eq 0)
    return
  }

  Away; Pump 300

  # 1. 앱이 시작하고 60초 안에 바를 오른 뒤(climb) 바 꼭대기에 앉는다(sit)
  try {
    $readyMark = ReadyMark; $readyAt = ReadyTime
    $null = WaitLog $readyMark 'pet.state' { $_.mode -eq 'sit' } 90000
    $modes = @(LogsAfter $readyMark 'pet.state' | ForEach-Object { $_.mode })
    $ci = [Array]::IndexOf($modes, 'climb'); $si = [Array]::IndexOf($modes, 'sit')
    $sits = @(LogsAfter $readyMark 'pet.state' | Where-Object { $_.mode -eq 'sit' })
    $r.pet_bar_flow_within_60s = ($ci -ge 0 -and $si -gt $ci -and $null -ne $readyAt -and (ClockMs (LogTime $sits[0]) $readyAt) -le 60000)
    $r.info_pet_flow = if ($sits.Count -gt 0 -and $readyAt) { 'modes={0} sit_after_ready_ms={1}' -f ($modes -join ','), (ClockMs (LogTime $sits[0]) $readyAt) } else { 'no sit' }
    $sit = $sits[-1]
    $r.info_sit = if ($sit) { 'box x={0} y={1} w={2} h={3}' -f $sit.box.x, $sit.box.y, $sit.box.width, $sit.box.height } else { 'none' }
    if ($sit) { ShotRect 'm6-pet-sit' $sit.window $scale }
  } catch { $r['error_1_flow'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 시험 창: 가짜 회의 메모(가상 고객사 이름 포함)와, 펫 창 왼쪽 아래 구석(펫 몸 밖)에 놓는 단추. 누른 횟수는 단추 Tag에 센다
  $now = WaitPetStill $scale 300 15000 $size
  [System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')
  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'SureMate-Test'; $form.ControlBox = $false; $form.StartPosition = 'Manual'
  $tb = New-Object System.Windows.Forms.TextBox
  $tb.Multiline = $true; $tb.HideSelection = $false; $tb.Left = 10; $tb.Top = 10; $tb.Width = 520; $tb.Height = 200
  $memoLine = '가상자동차 납품 일정은 다음 주 금요일까지 확정한다'
  $tb.Text = "주간 회의 메모`r`n$memoLine`r`nXY방산 담당자에게 정적분석 결과를 공유한다"
  $form.Controls.Add($tb)
  $btn = New-Object System.Windows.Forms.Button
  $btn.Text = 'X'; $btn.Width = 40; $btn.Height = 28; $btn.Tag = 0
  $btn.Add_Click({ param($s, $e) $s.Tag = [int]$s.Tag + 1 })
  $form.Controls.Add($btn)
  $form.Show(); Pump 300
  if ($now) { PlaceForm $now.window } else { $r.info_form = 'pet window not found; button position is a guess'; PlaceForm (New-Object psobject -Property @{ x = 100; y = 100; width = 320; height = 240 }) }
  FocusForm
  $r.info_pet_now = if ($now) { 'exact={0} window x={1} y={2}' -f $now.exact, $now.window.x, $now.window.y } else { 'none' }

  # 2. 클릭 통과: 펫 몸 밖의 단추는 눌리고, 몸은 펫이 받고(단추는 안 눌림), 앞 창은 그대로, 작업 표시줄 클릭 뒤 바가 2초 안에 맨 위
  try {
    $btn.Tag = 0
    ClickButton; Pump 400
    $r.click_through_transparent = ([int]$btn.Tag -eq 1)
    FocusForm
    $now = WaitPetStill $scale 300 10000 $size
    $c = PetCenter $now
    $mark = LogMark
    PetClick $c
    $hop = WaitLog $mark 'pet.click' { $_.kind -eq 'hop' } 2000
    Pump 400
    $r.click_on_pet_received = ($null -ne $hop -and [int]$btn.Tag -eq 1)
    $r.pet_click_kept_focus = ((Fg).Title -eq 'SureMate-Test')
    $tp = TaskbarBlankPoint
    if ($tp) {
      ClickAt $tp.x $tp.y
      $t2 = Get-Date; $top = $false
      while ((ElapsedMs $t2) -lt 2000 -and -not $top) { Pump 100; $top = TopmostIsApp $barPlace }
      $r.taskbar_click_ok = $top
      $r.info_taskbar_ms = ElapsedMs $t2
    } else { $r.taskbar_click_ok = 'skipped (taskbar auto-hide)' }
    FocusForm
  } catch { $r['error_2_click_through'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 3. 0.15초 간격으로 두 번 → 두 번 클릭 로그와 팔레트, Esc로 닫기
  try {
    $now = WaitPetStill $scale 300 10000 $size
    $mark = LogMark
    PetDoubleClick (PetCenter $now)
    $dbl = WaitLog $mark 'pet.click' { $_.kind -eq 'double' } 2000
    $pal = WaitLog $mark 'palette.show' { $true } 2500
    $r.double_click_opens_palette = ($null -ne $dbl -and $null -ne $pal)
    Pump 400
    TapHuman 0x1B; Pump 700
    FocusForm
  } catch { $r['error_3_double_click'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 4. 잡아서 왼쪽 위로 300 DIP 끌다 움직이는 중에 놓기 → held → land, 발이 바닥. 다시 잡아 바 꼭대기 위 40 DIP에서 멈췄다 놓기 → 1초 안에 sit
  try {
    $now = WaitPetStill $scale 300 10000 $size
    $c = PetCenter $now
    $to = [pscustomobject]@{ x = [Math]::Max(40, $c.x - 300); y = [Math]::Max(60, $c.y - 300) }
    $mark = LogMark
    $tRel = DragPath $c $to 250 $scale 0
    $held = WaitLog $mark 'pet.state' { $_.mode -eq 'held' } 1500
    $land = WaitLog $mark 'pet.state' { $_.mode -eq 'land' } 6000
    Pump 800
    $lastState = LogsAfter $mark 'pet.state' | Select-Object -Last 1
    # 발 y = 상자 위 + 58/64 × 크기. 바닥은 작업 영역 아래 끝(DIP)
    $foot = if ($lastState) { $lastState.box.y + $lastState.box.height * 58 / 64 } else { -1 }
    $r.thrown_lands_on_floor = ($null -ne $held -and $null -ne $land -and [Math]::Abs($foot - $floorDip) -le 4)
    $r.info_throw = 'foot_y={0} floor_y={1} states={2}' -f $foot, $floorDip, ((LogsAfter $mark 'pet.state' | ForEach-Object { $_.mode }) -join ',')

    $now = WaitPetStill $scale 400 15000 $size
    $c2 = PetCenter $now
    $bar = LastBarPlace
    $to2 = [pscustomobject]@{ x = $bar.bounds.x + $bar.bounds.width / 2; y = [Math]::Max(20, $bar.bounds.y - 40 - $size * 54 / 64) }
    $mark = LogMark
    $tRel = DragPath $c2 $to2 600 $scale 400
    while ((ElapsedMs $tRel) -lt 80) { Pump 10 }
    $before = [int]$btn.Tag
    ClickButton
    $r.click_through_after_drag = ([int]$btn.Tag -eq ($before + 1))
    $sit2 = WaitLog $mark 'pet.state' { $_.mode -eq 'sit' } 1500
    $r.dropped_on_bar_sits = ($null -ne $sit2 -and (ClockMs (LogTime $sit2) $tRel) -le 1000)
    $r.info_drop = if ($sit2) { 'sit_after_release_ms={0}' -f (ClockMs (LogTime $sit2) $tRel) } else { 'no sit' }
    Pump 400
    $now = WaitPetStill $scale 300 8000 $size
    if ($now) { PlaceForm $now.window }
    FocusForm
  } catch { $r['error_4_drag'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 6. 오른쪽 클릭 메뉴와 조종 모드. 숨기기 → 바 펫 단추로 다시 부른 직후 첫 메뉴 행(조종하기) 클릭, ←를 1초 누름·Space·Esc
  try {
    FocusForm
    $mark = LogMark
    $menu = OpenPetMenu
    $r.pet_menu_opened = ($null -ne $menu)
    if ($menu) {
      Pump 300; ShotRect 'm6-pet-menu' $script:menuNow.window $scale
      PetMenuRow $menu 2
      $hid = WaitLog $mark 'pet.visibility' { $_.visible -eq $false } 3000
      $r.menu_hide_row_works = ($null -ne $hid -and $null -eq (PetWindowRect $scale))
      Pump 800
      $rv = RecallViaBar
      $r.recall_via_bar_button = ($null -ne $rv)
      Pump 300
      # 다시 나타난 직후(약 1초 안)의 첫 메뉴 행. 다시 시도하지 않는다
      $ok = StartControl
      $r.menu_first_row_after_recall = $ok
      if ($ok) {
        $startBox = (PetNow $scale $size).box
        $mark2 = LogMark
        HoldArrow 0x25 1000; Pump 300
        TapHuman 0x20
        Pump 2200
        $after = LogsAfter $mark2 'pet.state' | Select-Object -Last 1
        $r.control_walks = ($null -ne $after -and $null -ne $startBox -and $after.box.x -lt ($startBox.x - 10))
        $r.info_control_walk = if ($after -and $startBox) { 'x {0} -> {1}' -f $startBox.x, $after.box.x } else { 'no pet.state after keys' }
        $mark3 = LogMark
        TapHuman 0x1B
        $end = WaitLog $mark3 'pet.control' { $_.phase -eq 'end' } 2500
        $r.control_esc_ends = ($null -ne $end -and $end.reason -eq 'esc')
        Pump 800
        $r.control_esc_restores_focus = ((Fg).Title -eq 'SureMate-Test')
        $r.info_foreground_after_control = (Fg).Title
      }
    }
    FocusForm

    # 조종 두 번째: Alt+Space는 시스템 메뉴 없이 조종이 이어지고(캡처로 확인), Alt+F4는 펫 창을 남기고 조종만 끝낸다
    if (StartControl) {
      $mark = LogMark
      HoldCombo 'alt+space' 300; Pump 700
      PetShot 'm6-pet-alt-space'
      $r.alt_space_keeps_control = (@(LogsAfter $mark 'pet.control' | Where-Object { $_.phase -eq 'end' }).Count -eq 0)
      $r.info_foreground_before_alt_f4 = (Fg).Process
      if (IsApp) {
        $mark = LogMark
        HoldCombo 'alt+f4' 300
        $end = WaitLog $mark 'pet.control' { $_.phase -eq 'end' } 2500
        $cls = WaitLog $mark 'pet.close' { $true } 1500
        Pump 500
        $r.alt_f4_ends_control = ($null -ne $end)
        $r.alt_f4_keeps_pet_window = ($null -ne $cls -and $cls.prevented -eq $true -and $null -ne (PetWindowRect $scale) -and @(LogsAfter $mark 'pet.visibility' | Where-Object { $_.visible -eq $false }).Count -eq 0)
      } else {
        $r.alt_f4_ends_control = 'skipped (foreground is not the app: control did not take focus)'
        EndControlIfAny
      }
    } else { $r.alt_space_keeps_control = $false }
    FocusForm

    # 조종 세 번째: 조종 중 팔레트(단축키)를 열면 팔레트가 포커스를 유지하고 조종은 끝난다(blur)
    if (StartControl) {
      $mark = LogMark
      HoldCombo $Combo 300
      $ps = WaitLog $mark 'palette.show' { $true } 2500
      $end = WaitLog $mark 'pet.control' { $_.phase -eq 'end' } 2500
      Pump 500
      $r.control_palette_keeps_focus = ($null -ne $ps -and (IsApp))
      $r.control_palette_ends_control = ($null -ne $end -and $end.reason -eq 'blur')
      $r.info_control_palette_foreground = (Fg).Title
      TapHuman 0x1B; Pump 700
    } else { $r.control_palette_keeps_focus = $false }
    FocusForm
  } catch { $r['error_6_menu_control'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)"; try { EndControlIfAny } catch { } }

  # 5. 반응: 회의 메모를 선택해 바 첫 고정 프롬프트를 누르면 1초 안에 celebrate, 가명 처리를 끄고 같은 동작이면 warn
  try {
    Pump 1500
    FocusForm; $tb.SelectAll(); Pump 200
    $mark = LogMark
    $pt = BarPointPx $barPlace 'prompt1'
    ClickAt $pt.x $pt.y
    $tClick = (Get-Date).ToUniversalTime()
    $re = WaitLog $mark 'pet.react' { $_.kind -eq 'celebrate' } 3000
    $r.reaction_within_1s = ($null -ne $re -and (ClockMs (LogTime $re) $tClick) -lt 1000)
    $r.info_reaction_ms = if ($re) { ClockMs (LogTime $re) $tClick } else { 'none' }
    Pump 700; PetShot 'm6-pet-celebrate'
    Pump 4500

    Away; Pump 300
    $mark = LogMark
    $shield = BarPointPx $barPlace 'masking'
    ClickAt $shield.x $shield.y
    $menu = WaitLog $mark 'flyout.show' { $_.kind -eq 'masking-menu' } 2000
    if ($menu) {
      Pump 400; ClickMenuRow $menu 58
      $off = WaitSetting { param($s) $s.masking.mode -eq 'off' } 3000
      Away; Pump 800
      FocusForm; $tb.SelectAll(); Pump 200
      $mark = LogMark
      ClickAt $pt.x $pt.y
      $tClick = (Get-Date).ToUniversalTime()
      $wr = WaitLog $mark 'pet.react' { $_.kind -eq 'warn' } 3000
      $r.warning_on_masking_off = ($off -and $null -ne $wr)
      $r.info_warn_ms = if ($wr) { ClockMs (LogTime $wr) $tClick } else { 'none' }
      Pump 700; PetShot 'm6-pet-warn'
      Pump 4500
      # 되돌리기 모드로 복구
      Away; Pump 300
      $mark = LogMark
      ClickAt $shield.x $shield.y
      $menu2 = WaitLog $mark 'flyout.show' { $_.kind -eq 'masking-menu' } 2000
      if ($menu2) { Pump 300; ClickMenuRow $menu2 110 }
      $r.masking_restored = WaitSetting { param($s) $s.masking.mode -eq 'restore' } 3000
    } else { $r.warning_on_masking_off = $false; $r.masking_restored = $false }
    FocusForm
  } catch { $r['error_5_reactions'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 6b. 다시 나타난 직후 첫 클릭·첫 끌기(숨김은 hide()/showInactive라 첫 누름이 드물게 사라질 수 있다, 한 번 False면 다시 실행해 본다)
  try {
    $mark = LogMark
    [void](HideViaMenu); Pump 600
    [void](RecallViaBar); Pump 300
    $now = WaitPetStill $scale 300 12000 $size
    if ($now) {
      $mark = LogMark
      PetClick (PetCenter $now)
      $r.first_click_after_reappear = ($null -ne (WaitLog $mark 'pet.click' { $_.kind -eq 'hop' } 1500))
    } else { $r.first_click_after_reappear = $false }
    Pump 800
    [void](HideViaMenu); Pump 600
    [void](RecallViaBar); Pump 300
    $now = WaitPetStill $scale 300 12000 $size
    if ($now) {
      $c = PetCenter $now
      $mark = LogMark
      [void](DragPath $c ([pscustomobject]@{ x = [Math]::Max(40, $c.x - 120); y = [Math]::Max(60, $c.y - 80) }) 300 $scale 0)
      $r.first_drag_after_reappear = ($null -ne (WaitLog $mark 'pet.state' { $_.mode -eq 'held' } 1500))
    } else { $r.first_drag_after_reappear = $false }
    Pump 2500
  } catch { $r['error_6b_reappear'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 7. 전체 화면 창이 앞에 오면 펫이 숨고(1초마다 확인), 닫으면 다시 나타난다. 다시 나타난 직후 첫 메뉴 행(조종하기) 클릭
  try {
    $full = New-Object System.Windows.Forms.Form
    $full.Text = 'SureMate-Fullscreen'; $full.ControlBox = $false; $full.FormBorderStyle = 'None'; $full.StartPosition = 'Manual'; $full.ShowInTaskbar = $false
    $full.Bounds = $scr.Bounds; $full.BackColor = [System.Drawing.Color]::FromArgb(24, 26, 34)
    $mark = LogMark
    $t0 = Get-Date
    $full.Show(); Key 0x12; [void][W]::SetForegroundWindow($full.Handle); Key 0x12 -Up; $full.Activate()
    $hid = WaitLog $mark 'pet.visibility' { $_.visible -eq $false -and $_.reason -eq 'fullscreen' } 3000
    $hideMs = ClockMs (Get-Date) $t0
    $mark = LogMark
    $t1 = Get-Date
    $full.Close(); FocusForm
    $back = WaitLog $mark 'pet.visibility' { $_.visible -eq $true } 3000
    $showMs = ClockMs (Get-Date) $t1
    $r.pet_hides_fullscreen = ($null -ne $hid -and $null -ne $back -and $hideMs -le 1100 -and $showMs -le 1100)
    $r.info_fullscreen_ms = 'hide={0} show={1}' -f $hideMs, $showMs
    Pump 300
    $r.menu_first_row_after_fullscreen = (StartControl)
    EndControlIfAny
    FocusForm
  } catch { $r['error_7_fullscreen'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 8. 입력 없이 70초 → 졸고(sleep), 펫 위로 커서를 올리면 깬다(wake)
  try {
    Away; Pump 500
    $mark = LogMark
    Pump 70000
    $sl = WaitLog $mark 'pet.state' { $_.mode -eq 'sleep' } 15000
    $r.pet_sleeps = ($null -ne $sl)
    if ($sl) {
      $sc = PetCenter $sl
      $px = [int][Math]::Round($sc.x * $scale); $py = [int][Math]::Round($sc.y * $scale)
      $mark = LogMark
      $th = HoverEnter $px $py
      $wk = WaitLog $mark 'pet.state' { $_.mode -eq 'wake' } 3000
      $r.pet_wakes_on_hover = ($null -ne $wk)
      $r.info_wake_ms = ElapsedMs $th
    } else { $r.pet_wakes_on_hover = $false }
    Away
  } catch { $r['error_8_sleep'] = "$_ at line $($_.InvocationInfo.ScriptLineNumber)" }

  # 9. 로그에 메모 글·가상 이름·말풍선 문구가 없다. 오류 로그 없음. 참고값: 메모리
  $appLines = @(Get-Content $logFile -Encoding UTF8 | Select-Object -Skip $startLines) -join "`n"
  $names = @('가상자동차', 'XY방산', '주간 회의', $memoLine, '가명으로 바꿨어요', '가명 처리가 꺼져 있어요', '원하는 곳에 붙여넣어', '키보드로 조종해 보세요', '말랑 메이트가 숨어 있어요')
  $r.log_has_no_content = (@($names | Where-Object { $_ -and $appLines.Contains($_) }).Count -eq 0)
  $r.log_has_no_typed_text = -not ($appLines -match '"(text|query|definition|selection|bubble)":')
  $r.pet_no_errors = (@(SinceAppReady 'pet.error').Count -eq 0 -and @(SinceAppReady 'pet.startError').Count -eq 0 -and @(SinceAppReady 'pet.commandError').Count -eq 0)
  $r.info_memory_mb = [int]((@(AppProcs) | Measure-Object WorkingSet64 -Sum).Sum / 1MB)
  $r.info_private_mb = [int]((@(AppProcs) | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB)
} catch {
  $r.error = "$_ at line $($_.InvocationInfo.ScriptLineNumber)"
} finally {
  foreach ($f in @($form, $full)) { if ($f) { try { $f.Close() } catch { } } }
  $r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
}
