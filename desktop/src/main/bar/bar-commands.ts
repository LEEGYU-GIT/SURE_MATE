import type { BarShape } from '../../shared/bar/bar-settings'
import { nextBarShape } from '../../shared/bar/bar-settings'
import { barShapeLabel } from '../../shared/labels'
import type { PaletteItem } from '../../shared/types'
import { errorText } from '../error-text'

/** 바를 끄거나 잠시 숨기면 바 메뉴가 없으므로, 키보드만으로 바 모양을 바꾸는 팔레트 명령(§16) */
export function barCommandItems(shape: BarShape): PaletteItem[] {
  return [
    {
      id: 'cmd.bar-shape',
      group: 'command',
      title: 'Sure-Mate 바 모양 바꾸기',
      subtitle: `지금: ${barShapeLabel(shape)} · 누르면 ${barShapeLabel(nextBarShape(shape))}`,
      keywords: ['bar', '바', '사이드바', '모양', '숨기기']
    }
  ]
}

export interface BarCommandDeps {
  getShape(): BarShape
  /** 모양을 저장하고 잠시 숨김을 푼다 */
  setShape(shape: BarShape): Promise<void>
  /** 명령을 고른 Enter·보조키를 뗄 때까지 기다린다. 시간 안에 안 떼면 false(그때는 팔레트를 숨기지 않는다) */
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
}

export function createBarCommands(d: BarCommandDeps): { run(id: string): Promise<boolean> } {
  return {
    async run(id) {
      if (id !== 'cmd.bar-shape') return false
      try {
        // 누른 채로 숨기면 자동 반복 Enter가 원래 앱으로 가므로, 뗀 것을 확인했을 때만 숨긴다
        if (await d.waitKeysReleased()) d.hidePalette(true)
        const next = nextBarShape(d.getShape())
        await d.setShape(next)
        d.notify(`Sure-Mate 바: ${barShapeLabel(next)}${next === 'off' ? ' — 트레이 아이콘에서 다시 켤 수 있어요' : ''}`)
        d.log('bar.shapeCommand', { shape: next })
      } catch (e) {
        d.log('bar.commandError', { id, error: errorText(e) })
        d.notify('처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.')
      }
      return true
    }
  }
}
