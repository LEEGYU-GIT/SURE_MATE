import { nextBarShape, type BarShape } from '../../shared/bar/bar-settings'
import { barShapeLabel } from '../../shared/labels'
import type { PaletteItem } from '../../shared/types'

/**
 * 팔레트 명령 "Sure-Mate 바 모양 바꾸기". 바를 끄거나 잠시 숨기면 바 메뉴도 사라지므로 다시 켤 곳이 필요하고,
 * 키보드만으로도 바꿀 수 있어야 한다(설계 문서 §16).
 */
export function barCommandItems(shape: BarShape): PaletteItem[] {
  return [
    {
      id: 'cmd.bar-shape',
      group: 'command',
      title: 'Sure-Mate 바 모양 바꾸기',
      subtitle: `지금: ${barShapeLabel(shape)} · 누르면 ${barShapeLabel(nextBarShape(shape))}`,
      keywords: ['bar', '바', '사이드바', '모양', '숨기기', '켜기']
    }
  ]
}

export interface BarCommandDeps {
  getShape(): BarShape
  /** 저장하고 바에 적용한다(잠시 숨김도 푼다) */
  setShape(shape: BarShape): Promise<void>
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
}

/** 가명 처리 기본값 바꾸기와 같은 순서: 키를 뗀 것을 확인했을 때만 팔레트를 숨기고 → 다음 모양 → 알림 */
export function createBarCommands(d: BarCommandDeps): { run(id: string): Promise<boolean> } {
  return {
    async run(id) {
      if (id !== 'cmd.bar-shape') return false
      if (await d.waitKeysReleased()) d.hidePalette(true)
      const next = nextBarShape(d.getShape())
      await d.setShape(next)
      d.notify(`Sure-Mate 바: ${barShapeLabel(next)}${next === 'off' ? ' — 트레이 아이콘에서 다시 켤 수 있어요' : ''}`)
      d.log('bar.shape', { shape: next, source: 'palette' })
      return true
    }
  }
}
