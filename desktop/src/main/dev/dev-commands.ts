import { leftHalf, pickOtherMonitor, rectDiff } from '../../shared/geometry'
import type { PaletteItem, Rect } from '../../shared/types'
import { errorText } from '../error-text'
import { log } from '../log'
import { getMonitors, monitorOfPhysicalRect, toPhysical } from '../native/coords'
import { pasteText, writeClipboardText } from '../native/selection'
import { nativeStatus } from '../native/win32'
import { getWindowInfo, listWindows, moveWindow } from '../native/windows'
import { getPreviousHwnd, hidePalette, showPalette } from '../windows/palette-window'

// M1 네이티브 검증용 개발 명령. 로그에는 창 제목을 남기지 않는다(문서 이름이 들어갈 수 있음).

export const isDevCommand = (id: string): boolean => id.startsWith('dev.')

/** 팔레트 명령 구역에 보일 개발 명령(M1 검증용, 출품 빌드 전에 숨긴다) */
export const DEV_COMMAND_ITEMS: PaletteItem[] = [
  { id: 'dev.imeLogger', group: 'command', title: '개발: 한글 입력 기록기', keywords: ['ime', 'dev'] },
  { id: 'dev.listWindows', group: 'command', title: '개발: 창 목록', keywords: ['window', 'dev'] },
  { id: 'dev.moveToOtherMonitor', group: 'command', title: '개발: 직전 창을 다른 모니터 왼쪽 절반으로', keywords: ['monitor', 'dev'] },
  { id: 'dev.pasteTest', group: 'command', title: '개발: 붙여넣기 시험', keywords: ['paste', 'dev'] },
  { id: 'dev.clipboardExcludeTest', group: 'command', title: '개발: 클립보드 기록 제외 시험', keywords: ['clipboard', 'dev'] },
  // 스모크 시험·시연용: 입력 없이 기다리지 않고 이석 미리 알림을 지금 보인다. 펫·설정이 index.ts에 있어 dev.imeLogger처럼 runItem이 처리한다
  { id: 'dev.awayPreview', group: 'command', title: '개발: 이석 미리 알림 보기', keywords: ['이석', 'away', 'dev'] }
]

const fmt = (r: Rect): string => `${r.x},${r.y} ${r.width}×${r.height}`

function output(title: string, lines: string[]): void {
  showPalette({ mode: 'dev-output', title, text: lines.join('\n') })
}

function showWindowList(): void {
  const started = performance.now()
  const windows = listWindows()
  const ms = Math.round(performance.now() - started)
  const monitors = getMonitors()
  log('dev.listWindows', { count: windows.length, ms, monitors: monitors.length, exes: [...new Set(windows.map((x) => x.exe))] })
  output('창 목록', [
    `모니터 ${monitors.length}개`,
    ...monitors.map(
      (m) => `  ${m.isPrimary ? '주' : '  '} ${m.isInternal ? '내장' : '외부'} ${fmt(m.bounds)} DIP · 배율 ${m.scaleFactor}`
    ),
    '',
    `창 ${windows.length}개 (${ms}ms)`,
    ...windows.map(
      (x) =>
        `${x.exe.padEnd(24)} ${x.title.slice(0, 40).padEnd(42)} 보이는 테두리 ${fmt(x.frame)} · DPI ${x.dpi}` +
        `${x.maximized ? ' · 최대화' : ''}${x.minimized ? ' · 최소화' : ''}${x.elevated ? ' · 관리자' : ''}`
    )
  ])
}

async function moveToOtherMonitor(): Promise<void> {
  const title = '직전 창을 다른 모니터 왼쪽 절반으로'
  const previous = getPreviousHwnd()
  const info = previous ? getWindowInfo(previous) : null
  if (!info) return output(title, ['직전 창을 찾지 못했어요. 옮길 창을 누른 뒤 팔레트를 다시 여세요.'])
  if (info.elevated) return output(title, [`${info.exe}는 관리자 권한으로 실행 중이라 옮길 수 없어요(UIPI).`])

  const current = monitorOfPhysicalRect(info.frame)
  const other = pickOtherMonitor(getMonitors(), current.id)
  // 모니터가 하나면 같은 모니터 왼쪽 절반으로 옮겨 이동·테두리 보정만이라도 확인한다
  const dest = other ?? current
  const target = toPhysical(leftHalf(dest.workArea))
  const result = await moveWindow(info.hwnd, target, Math.round(dest.scaleFactor * 96))
  const diff = rectDiff(result.after, target)
  log('dev.moveWindow', {
    exe: info.exe,
    sameMonitor: !other,
    fromScale: current.scaleFactor,
    toScale: dest.scaleFactor,
    steps: result.steps,
    target,
    after: result.after,
    diff
  })
  output(title, [
    other ? `배율 ${current.scaleFactor} → ${dest.scaleFactor} 모니터로 옮김` : '다른 모니터가 없어 같은 모니터 왼쪽 절반으로 옮김',
    `대상 창: ${info.exe} (${info.title.slice(0, 50)})`,
    `옮기기 전 보이는 테두리: ${fmt(result.before)}`,
    `목표(물리 픽셀): ${fmt(target)}`,
    `옮긴 뒤 보이는 테두리: ${fmt(result.after)}`,
    `차이: ${diff}px (10px 이하면 통과) · 단계 ${result.steps}`
  ])
}

async function pasteTest(): Promise<void> {
  const target = getPreviousHwnd()
  hidePalette({ restoreFocus: false })
  if (!target) return output('붙여넣기 시험', ['직전 창이 없어요.'])
  const text = `Sure-Mate 붙여넣기 시험 ${new Date().toLocaleTimeString('ko-KR')}`
  const result = await pasteText(target, text)
  log('dev.paste', { ok: result.ok, reason: result.reason ?? null })
  if (!result.ok) output('붙여넣기 시험', [`붙여넣지 못하고 복사만 했어요: ${result.reason}`])
}

async function clipboardExcludeTest(): Promise<void> {
  const text = `Sure-Mate 기록 제외 시험 ${new Date().toLocaleTimeString('ko-KR')}`
  const result = await writeClipboardText(text, { excludeFromHistory: true })
  log('dev.clipboardExclude', { ok: result.excluded, error: result.error ?? null })
  output('클립보드 기록 제외 시험', [
    result.excluded ? `클립보드에 "${text}"를 넣었어요.` : `기록 제외 표시를 붙이지 못해 보통으로 썼어요: ${result.error}`,
    'Win+V를 눌러 클립보드 기록에 이 글이 없으면 통과예요(Ctrl+V로는 붙여넣어져야 해요).'
  ])
}

export async function runDevCommand(id: string): Promise<void> {
  const native = nativeStatus()
  if (!native.ok && id !== 'dev.clipboardExcludeTest') {
    return output(id, ['Win32 기능(koffi)을 불러오지 못해 이 개발 명령을 쓸 수 없어요.', errorText(native.error)])
  }
  switch (id) {
    case 'dev.listWindows':
      return showWindowList()
    case 'dev.moveToOtherMonitor':
      return moveToOtherMonitor()
    case 'dev.pasteTest':
      return pasteTest()
    case 'dev.clipboardExcludeTest':
      return clipboardExcludeTest()
    default:
      return output(id, ['아직 만들지 않은 개발 명령이에요.'])
  }
}
