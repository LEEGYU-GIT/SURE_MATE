import { leftHalf, pickOtherMonitor, rectDiff } from '../../shared/geometry'
import type { Rect } from '../../shared/types'
import { log } from '../log'
import { getMonitors, monitorOfPhysicalRect, toPhysical } from '../native/coords'
import { getWindowInfo, listWindows, moveWindow } from '../native/windows'
import { getPreviousHwnd, showPalette } from '../windows/palette-window'

// M1 네이티브 검증용 개발 명령. 로그에는 창 제목을 남기지 않는다(문서 이름이 들어갈 수 있음).

export const isDevCommand = (id: string): boolean => id.startsWith('dev.')

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

export async function runDevCommand(id: string): Promise<void> {
  switch (id) {
    case 'dev.listWindows':
      return showWindowList()
    case 'dev.moveToOtherMonitor':
      return moveToOtherMonitor()
    default:
      return output(id, ['아직 만들지 않은 개발 명령이에요.'])
  }
}
