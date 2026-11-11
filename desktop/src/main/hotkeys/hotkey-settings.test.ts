import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings/settings'
import { globalTimers } from '../bar/test-timers'
import { createHotkeyChanger } from './hotkey-change'
import { HotkeyManager, type ShortcutBackend } from './hotkey-manager'
import { hotkeyStatuses, withHotkeySetting } from './hotkey-settings'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const base = (): Settings => structuredClone(DEFAULT_SETTINGS)

it('조종 단축키는 pet.controlHotkey에, 팔레트·용어 찾기는 hotkeys에 저장한다(다른 값은 그대로)', () => {
  const s = base()
  const pet = withHotkeySetting(s, 'pet-control', 'Ctrl+Alt+P')
  expect(pet.pet).toEqual({ ...s.pet, controlHotkey: 'Ctrl+Alt+P' })
  expect({ ...pet, pet: s.pet }).toEqual(s)
  expect(withHotkeySetting(pet, 'pet-control', null).pet.controlHotkey).toBeNull()
  const palette = withHotkeySetting(s, 'palette', 'Alt+`')
  expect(palette.hotkeys).toEqual({ palette: 'Alt+`', lookup: s.hotkeys.lookup })
  expect(palette.pet).toEqual(s.pet)
  expect(withHotkeySetting(s, 'lookup', 'Ctrl+Alt+L').hotkeys.lookup).toBe('Ctrl+Alt+L')
  // 팔레트·용어 찾기는 비울 수 없다(그대로)
  expect(withHotkeySetting(s, 'palette', null)).toBe(s)
  // 원래 객체는 바꾸지 않는다
  expect(s.pet.controlHotkey).toBeNull()
  expect(s.hotkeys.palette).toBe(DEFAULT_SETTINGS.hotkeys.palette)
})

it('설정 창의 단축키 상태: 등록된 조합, 못 잡았으면 설정 값과 등록 못 함, 조종 단축키가 없으면 acc null', () => {
  const s = withHotkeySetting(base(), 'pet-control', 'Ctrl+Alt+P')
  const bound: Record<string, string> = { palette: 'Alt+`' }
  expect(hotkeyStatuses(s, (id) => bound[id])).toEqual({
    palette: { acc: 'Alt+`', registered: true },
    lookup: { acc: s.hotkeys.lookup, registered: false },
    'pet-control': { acc: 'Ctrl+Alt+P', registered: false }
  })
  expect(hotkeyStatuses(base(), () => undefined)['pet-control']).toEqual({ acc: null, registered: false })
})

it('연결(index.ts와 같은 모양): 조종 단축키를 정하면 바로 등록·저장되고, 비우면 바로 풀린다(다시 시작하지 않아도)', async () => {
  const registered = new Map<string, () => void>()
  const backend: ShortcutBackend = {
    register: (acc, cb) => {
      if (registered.has(acc)) return false
      registered.set(acc, cb)
      return true
    },
    unregister: (acc) => void registered.delete(acc)
  }
  let settings = base()
  const manager = new HotkeyManager(backend, () => Date.now())
  manager.bind('palette', settings.hotkeys.palette, () => {})
  manager.bind('lookup', settings.hotkeys.lookup, () => {})
  let presses = 0
  manager.bind('pet-control', settings.pet.controlHotkey, () => void presses++)
  const changer = createHotkeyChanger({
    manager,
    probe: () => true,
    save: async (id, acc) => {
      settings = withHotkeySetting(settings, id, acc)
    },
    timers: globalTimers(),
    log: () => {}
  })
  const status = () => hotkeyStatuses(settings, (id) => manager.current(id))['pet-control']

  expect(status()).toEqual({ acc: null, registered: false })
  expect((await changer.set('pet-control', 'Ctrl+Alt+P')).ok).toBe(true)
  expect(settings.pet.controlHotkey).toBe('Ctrl+Alt+P')
  expect(status()).toEqual({ acc: 'Ctrl+Alt+P', registered: true })
  registered.get('Ctrl+Alt+P')?.()
  expect(presses).toBe(1)

  expect((await changer.set('pet-control', null)).ok).toBe(true)
  expect(settings.pet.controlHotkey).toBeNull()
  expect(status()).toEqual({ acc: null, registered: false })
  expect(registered.has('Ctrl+Alt+P')).toBe(false)
})
