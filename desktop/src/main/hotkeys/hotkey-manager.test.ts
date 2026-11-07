import { expect, it } from 'vitest'
import { HotkeyManager, type ShortcutBackend } from './hotkey-manager'

class FakeBackend implements ShortcutBackend {
  taken = new Set<string>()
  registered = new Map<string, () => void>()
  register(acc: string, cb: () => void): boolean {
    if (this.taken.has(acc) || this.registered.has(acc)) return false
    this.registered.set(acc, cb)
    return true
  }
  unregister(acc: string): void {
    this.registered.delete(acc)
  }
  fire(acc: string): void {
    this.registered.get(acc)?.()
  }
}

it('다른 앱이 쓰는 조합이면 in-use', () => {
  const b = new FakeBackend()
  b.taken.add('Alt+Space')
  expect(new HotkeyManager(b).bind('palette', 'Alt+Space', () => {})).toEqual({ ok: false, reason: 'in-use' })
})

it('막힌 조합은 등록을 시도하지 않는다', () => {
  const b = new FakeBackend()
  const r = new HotkeyManager(b).bind('palette', 'Super+Space', () => {})
  expect(r.ok).toBe(false)
  expect(b.registered.size).toBe(0)
})

it('rebind 실패하면 이전 조합으로 되돌린다', () => {
  const b = new FakeBackend()
  const m = new HotkeyManager(b)
  m.bind('palette', 'Ctrl+Alt+Space', () => {})
  b.taken.add('Alt+`')
  expect(m.rebind('palette', 'Alt+`').ok).toBe(false)
  expect(m.current('palette')).toBe('Ctrl+Alt+Space')
  expect(b.registered.has('Ctrl+Alt+Space')).toBe(true)
})

it('누르고 있을 때의 반복은 무시한다', () => {
  let t = 0
  const b = new FakeBackend()
  const m = new HotkeyManager(b, () => t)
  let n = 0
  m.bind('palette', 'Ctrl+Alt+Space', () => n++)
  for (const ms of [0, 100, 200, 449, 700]) {
    t = ms
    b.fire('Ctrl+Alt+Space')
  }
  expect(n).toBe(2)
})

it('suspendAll 뒤 resumeAll은 다시 등록하고 실패한 id를 알려 준다', () => {
  const b = new FakeBackend()
  const m = new HotkeyManager(b)
  m.bind('palette', 'Ctrl+Alt+Space', () => {})
  m.bind('lookup', 'Ctrl+Alt+W', () => {})
  m.suspendAll()
  expect(b.registered.size).toBe(0)
  b.taken.add('Ctrl+Alt+W')
  expect(m.resumeAll()).toEqual({ failed: ['lookup'] })
})

it('첫 조합이 쓰이고 있으면 다음 후보로 등록한다', () => {
  const b = new FakeBackend()
  b.taken.add('Ctrl+Alt+Space')
  const m = new HotkeyManager(b)
  expect(m.bindFirst('palette', ['Ctrl+Alt+Space', 'Alt+`'], () => {})).toEqual({ ok: true, acc: 'Alt+`' })
  expect(m.current('palette')).toBe('Alt+`')
})

it('모든 후보가 안 되면 시도한 목록을 돌려준다', () => {
  const b = new FakeBackend()
  b.taken.add('Ctrl+Alt+Space')
  b.taken.add('Alt+`')
  const tried = ['Ctrl+Alt+Space', 'Alt+`', 'Super+Space']
  expect(new HotkeyManager(b).bindFirst('palette', tried, () => {})).toEqual({ ok: false, tried })
  expect(b.registered.size).toBe(0)
})
