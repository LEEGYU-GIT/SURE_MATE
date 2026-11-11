import { expect, it, vi } from 'vitest'
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

it('누르고 있으면 약 0.5초 뒤의 첫 자동 반복도 무시하고, 뗀 뒤 다시 누르면 받는다', () => {
  vi.useFakeTimers()
  try {
    let held = true
    const b = new FakeBackend()
    const m = new HotkeyManager(b, () => Date.now(), () => held)
    let n = 0
    m.bind('palette', 'Ctrl+Alt+Space', () => n++)
    b.fire('Ctrl+Alt+Space') // 누름
    vi.advanceTimersByTime(500)
    b.fire('Ctrl+Alt+Space') // 첫 자동 반복(Windows 기본 반복 지연)
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(33)
      b.fire('Ctrl+Alt+Space') // 이후 자동 반복
    }
    expect(n).toBe(1)
    held = false // 뗌
    vi.advanceTimersByTime(300)
    held = true
    b.fire('Ctrl+Alt+Space') // 다시 누름
    expect(n).toBe(2)
  } finally {
    vi.useRealTimers()
  }
})

it('키 상태가 계속 눌림으로 읽혀도 3초가 지나면 다시 받는다', () => {
  vi.useFakeTimers()
  try {
    const b = new FakeBackend()
    const m = new HotkeyManager(b, () => Date.now(), () => true)
    let n = 0
    m.bind('palette', 'Ctrl+Alt+Space', () => n++)
    b.fire('Ctrl+Alt+Space')
    vi.advanceTimersByTime(3100)
    b.fire('Ctrl+Alt+Space')
    expect(n).toBe(2)
  } finally {
    vi.useRealTimers()
  }
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

it('조합 없이(null) 묶으면 등록하지 않고 처리기만 둔다. 나중에 rebind로 조합을 붙이면 그 처리기가 불린다', () => {
  const b = new FakeBackend()
  const m = new HotkeyManager(b)
  let n = 0
  expect(m.bind('pet-control', null, () => n++)).toEqual({ ok: true })
  expect(m.current('pet-control')).toBeUndefined()
  expect(b.registered.size).toBe(0)
  expect(m.rebind('pet-control', 'Ctrl+Alt+P')).toEqual({ ok: true })
  expect(m.current('pet-control')).toBe('Ctrl+Alt+P')
  b.fire('Ctrl+Alt+P')
  expect(n).toBe(1)
})

it('unbind는 조합을 풀고 잊지만 처리기는 남긴다(일시 중지 뒤 되살리기에도 다시 등록하지 않는다)', () => {
  const b = new FakeBackend()
  const m = new HotkeyManager(b)
  let n = 0
  m.bind('pet-control', 'Ctrl+Alt+P', () => n++)
  m.unbind('pet-control')
  expect(m.current('pet-control')).toBeUndefined()
  expect(b.registered.has('Ctrl+Alt+P')).toBe(false)
  m.suspendAll()
  expect(m.resumeAll()).toEqual({ failed: [] })
  expect(b.registered.size).toBe(0)
  // 일시 중지한 동안 떼도 되살리지 않는다
  m.rebind('pet-control', 'Ctrl+Alt+O')
  m.suspendAll()
  m.unbind('pet-control')
  m.resumeAll()
  expect(b.registered.size).toBe(0)
  expect(m.rebind('pet-control', 'Ctrl+Alt+P').ok).toBe(true)
  b.fire('Ctrl+Alt+P')
  expect(n).toBe(1)
})

it('처음 묶을 때 다른 앱이 쓰는 조합이어도 처리기는 남아 나중에 다른 조합으로 rebind할 수 있다', () => {
  const b = new FakeBackend()
  b.taken.add('Ctrl+Alt+P')
  const m = new HotkeyManager(b)
  let n = 0
  expect(m.bind('pet-control', 'Ctrl+Alt+P', () => n++)).toEqual({ ok: false, reason: 'in-use' })
  expect(m.current('pet-control')).toBeUndefined()
  expect(m.rebind('pet-control', 'Ctrl+Alt+O').ok).toBe(true)
  b.fire('Ctrl+Alt+O')
  expect(n).toBe(1)
})

it('처리기를 정한 적 없는 id의 rebind는 거절한다', () => {
  expect(new HotkeyManager(new FakeBackend()).rebind('lookup', 'Ctrl+Alt+W').ok).toBe(false)
})

it('ids()는 지금 조합이 있는 단축키(워크스페이스 포함). unbind하면 풀리고 빠지며, 모르는 id의 unbind는 아무것도 하지 않는다', () => {
  const b = new FakeBackend()
  const m = new HotkeyManager(b)
  m.bind('palette', 'Alt+`', () => {})
  m.bind('workspace:ws-1', 'Ctrl+Alt+1', () => {})
  // 조합 없이 처리기만 둔 것은 들어가지 않는다
  m.bind('workspace:ws-2', null, () => {})
  expect([...m.ids()].sort()).toEqual(['palette', 'workspace:ws-1'])
  m.unbind('workspace:ws-1')
  expect(b.registered.has('Ctrl+Alt+1')).toBe(false)
  expect(m.ids()).toEqual(['palette'])
  m.unbind('workspace:nope')
  m.unbind('lookup')
  expect(m.ids()).toEqual(['palette'])
  expect([...b.registered.keys()]).toEqual(['Alt+`'])
})

it('일시 중지 중에 묶으면 등록해 보기만 하고(다른 앱이 쓰면 in-use) 되살릴 때 다른 단축키와 함께 등록한다', () => {
  const b = new FakeBackend()
  b.taken.add('Ctrl+Alt+9')
  const m = new HotkeyManager(b)
  let n = 0
  m.bind('palette', 'Alt+`', () => {})
  m.suspendAll()
  expect(m.bind('workspace:ws-1', 'Ctrl+Alt+1', () => n++)).toEqual({ ok: true })
  expect(b.registered.size).toBe(0)
  expect(m.current('workspace:ws-1')).toBe('Ctrl+Alt+1')
  expect(m.bind('workspace:ws-2', 'Ctrl+Alt+9', () => {})).toEqual({ ok: false, reason: 'in-use' })
  expect(m.current('workspace:ws-2')).toBeUndefined()
  expect(m.resumeAll()).toEqual({ failed: [] })
  expect([...b.registered.keys()].sort()).toEqual(['Alt+`', 'Ctrl+Alt+1'])
  b.fire('Ctrl+Alt+1')
  expect(n).toBe(1)
  // 되살린 뒤에는 바로 등록한다
  expect(m.bind('workspace:ws-3', 'Ctrl+Alt+3', () => {})).toEqual({ ok: true })
  expect(b.registered.has('Ctrl+Alt+3')).toBe(true)
})

it('(A-M6) isRegistered: 되살리지 못한 단축키는 조합을 기억해도(current) 등록되지 않은 것이다. 일시 중지 중은 등록된 것으로 본다', () => {
  const b = new FakeBackend()
  const m = new HotkeyManager(b)
  m.bind('palette', 'Alt+`', () => {})
  m.bind('workspace:ws-a', 'Ctrl+Alt+1', () => {})
  expect(m.isRegistered('workspace:ws-a')).toBe(true)
  m.suspendAll()
  // 녹화 중(되살릴 때 다시 등록한다)
  expect(m.isRegistered('workspace:ws-a')).toBe(true)
  b.taken.add('Ctrl+Alt+1')
  expect(m.resumeAll()).toEqual({ failed: ['workspace:ws-a'] })
  expect(m.current('workspace:ws-a')).toBe('Ctrl+Alt+1')
  expect(m.isRegistered('workspace:ws-a')).toBe(false)
  expect(m.isRegistered('palette')).toBe(true)
  // 다음 되살리기에 다시 잡으면 등록된 것
  b.taken.delete('Ctrl+Alt+1')
  m.suspendAll()
  expect(m.resumeAll()).toEqual({ failed: [] })
  expect(m.isRegistered('workspace:ws-a')).toBe(true)
  // 조합이 없는 단축키·모르는 id
  m.bind('pet-control', null, () => {})
  expect(m.isRegistered('pet-control')).toBe(false)
  expect(m.isRegistered('lookup')).toBe(false)
})
