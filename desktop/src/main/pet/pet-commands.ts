import type { PaletteItem } from '../../shared/types'
import { PET_CONTROL_KEYS, PET_HIDDEN_NOTICE, PET_RECALL_HINT } from '../../shared/pet/pet-copy'
import { errorText } from '../error-text'

/**
 * 바를 끈 뒤에도 말랑 메이트를 다시 부르고 조종하고 재우거나 깨울 수 있게 하는 팔레트 명령(§16 키보드만으로 사용).
 * 조종·재우기는 펫이 보일 때만. 재우기·깨우기는 지금 상태를 따른다(졸고 있으면 깨우기)
 */
export function petCommandItems(o: { visible: boolean; sleeping: boolean }): PaletteItem[] {
  const items: PaletteItem[] = [
    {
      id: 'cmd.pet-visible',
      group: 'command',
      title: o.visible ? '말랑 메이트 숨기기' : '말랑 메이트 보이기',
      keywords: ['pet', '펫', '말랑', '메이트', '숨기기', '보이기']
    }
  ]
  if (o.visible) {
    items.push(
      {
        id: 'cmd.pet-control',
        group: 'command',
        title: '말랑 메이트 조종하기',
        subtitle: PET_CONTROL_KEYS,
        keywords: ['pet', '펫', '말랑', '메이트', '조종', '움직이기']
      },
      {
        id: o.sleeping ? 'cmd.pet-wake' : 'cmd.pet-sleep',
        group: 'command',
        title: o.sleeping ? '말랑 메이트 깨우기' : '말랑 메이트 재우기',
        keywords: ['pet', '펫', '말랑', '메이트', '재우기', '깨우기', '졸기', 'sleep', 'wake']
      }
    )
  }
  return items
}

const PET_IDS = new Set(['cmd.pet-visible', 'cmd.pet-control', 'cmd.pet-sleep', 'cmd.pet-wake'])

export interface PetCommandDeps {
  isVisible(): boolean
  /** 보이기 값을 저장한다(저장 뒤 펫이 나타나거나 사라진다) */
  setVisible(visible: boolean): Promise<void>
  /** 조종 모드를 시작하고(펫이 포커스를 가져간다), 이미 조종 중이면 끝낸다 */
  toggleControl(): void
  /** 그 자리에서 재운다. 움직이는 중·조종 중·숨김이라 못 하면 false(PetController.putToSleep) */
  putToSleep(): boolean
  /** 깨운다. 숨김이라 못 하면 false(PetController.wakeUp) */
  wakeUp(): boolean
  /** 명령을 고른 Enter·보조키를 뗄 때까지 기다린다. 시간 안에 안 떼면 false */
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  /** 팔레트를 숨기고 원래 창이 앞에 올 때까지 기다린다(최대 80ms). 오지 않으면 false */
  hidePaletteAndRefocus(): Promise<boolean>
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
}

export function createPetCommands(d: PetCommandDeps): { run(id: string): Promise<boolean> } {
  return {
    async run(id) {
      if (!PET_IDS.has(id)) return false
      try {
        const released = await d.waitKeysReleased()
        if (id === 'cmd.pet-sleep' || id === 'cmd.pet-wake') {
          // 누른 채로 숨기면 자동 반복 Enter가 원래 앱으로 가므로, 뗀 것을 확인했을 때만 숨긴다(재우기·깨우기는 한다)
          if (released) d.hidePalette(true)
          const sleep = id === 'cmd.pet-sleep'
          const ok = sleep ? d.putToSleep() : d.wakeUp()
          if (!ok) {
            d.notify(
              sleep
                ? '지금은 재울 수 없어요. 말랑 메이트가 바닥이나 바 위에 있을 때 다시 해 주세요.'
                : '지금은 깨울 수 없어요. 말랑 메이트가 보일 때 다시 해 주세요.'
            )
          }
          d.log('pet.sleepCommand', { sleep, ok })
        } else if (id === 'cmd.pet-visible') {
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
          // 팔레트를 숨기고 원래 창이 앞에 온 뒤 시작해야 조종이 그 창을 기억하고 Esc 때 그리로 돌아간다(I1).
          // 80ms 안에 오지 않아도 시작한다: 조종은 숨은 팔레트 대신 팔레트가 돌아갈 창을 기억한다.
          // 이미 조종 중이면 끝낸다(M5: 포커스를 받지 못해 남은 조종도 키보드로 끝낼 수 있게)
          await d.hidePaletteAndRefocus()
          if (d.isVisible()) d.toggleControl()
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

export interface PetControlHotkeyDeps {
  /** 설정 pet.visible(사용자가 숨겼는지) */
  isVisible(): boolean
  /** 조종 시작·끝(전체 화면 앱으로 숨은 동안은 컨트롤러가 무시한다) */
  toggleControl(): void
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
}

/**
 * 조종 단축키 처리기(설계 §14-2). 사용자가 숨긴 펫은 조종을 시작하지 않고 다시 부르는 곳을 알린다.
 * 누를 때마다 한 번 불린다: 누르고 있는 동안의 자동 반복은 HotkeyManager가 거른다.
 */
export function createPetControlHotkey(d: PetControlHotkeyDeps): () => void {
  return () => {
    if (d.isVisible()) {
      d.toggleControl()
      return
    }
    d.notify(PET_HIDDEN_NOTICE)
    d.log('pet.controlHotkey', { hidden: true })
  }
}
