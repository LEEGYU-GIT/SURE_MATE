import type { PaletteItem } from '../../shared/types'
import { PET_CONTROL_KEYS, PET_RECALL_HINT } from '../../shared/pet/pet-copy'
import { errorText } from '../error-text'

/** 바를 끈 뒤에도 말랑 메이트를 다시 부르고 조종할 수 있게 하는 팔레트 명령(§16 키보드만으로 사용). 조종은 펫이 보일 때만 */
export function petCommandItems(o: { visible: boolean }): PaletteItem[] {
  const items: PaletteItem[] = [
    {
      id: 'cmd.pet-visible',
      group: 'command',
      title: o.visible ? '말랑 메이트 숨기기' : '말랑 메이트 보이기',
      keywords: ['pet', '펫', '말랑', '메이트', '숨기기', '보이기']
    }
  ]
  if (o.visible) {
    items.push({
      id: 'cmd.pet-control',
      group: 'command',
      title: '말랑 메이트 조종하기',
      subtitle: PET_CONTROL_KEYS,
      keywords: ['pet', '펫', '말랑', '메이트', '조종', '움직이기']
    })
  }
  return items
}

export interface PetCommandDeps {
  isVisible(): boolean
  /** 보이기 값을 저장한다(저장 뒤 펫이 나타나거나 사라진다) */
  setVisible(visible: boolean): Promise<void>
  /** 조종 모드를 시작한다(펫이 포커스를 가져간다) */
  startControl(): void
  /** 명령을 고른 Enter·보조키를 뗄 때까지 기다린다. 시간 안에 안 떼면 false */
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
}

export function createPetCommands(d: PetCommandDeps): { run(id: string): Promise<boolean> } {
  return {
    async run(id) {
      if (id !== 'cmd.pet-visible' && id !== 'cmd.pet-control') return false
      try {
        const released = await d.waitKeysReleased()
        if (id === 'cmd.pet-visible') {
          // 누른 채로 숨기면 자동 반복 Enter가 원래 앱으로 가므로, 뗀 것을 확인했을 때만 숨긴다(값은 바꾼다)
          if (released) d.hidePalette(true)
          const next = !d.isVisible()
          await d.setVisible(next)
          d.notify(next ? '말랑 메이트가 나왔어요.' : `말랑 메이트를 숨겼어요. ${PET_RECALL_HINT}.`)
          d.log('pet.visibleCommand', { visible: next })
        } else if (!released) {
          // 팔레트가 앞에 남은 채 펫이 포커스를 가져가지 않게 시작하지 않는다
          d.notify('키를 뗀 뒤 다시 실행해 주세요.')
        } else {
          // 팔레트를 숨겨 원래 창으로 포커스를 돌려 둔 뒤 시작해야 Esc 때 그 창으로 돌아간다
          d.hidePalette(true)
          if (d.isVisible()) d.startControl()
          d.log('pet.controlCommand', {})
        }
      } catch (e) {
        d.log('pet.commandError', { id, error: errorText(e) })
        d.notify('처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.')
      }
      return true
    }
  }
}
