import { describe, expect, it, vi } from 'vitest'
import type { AppEvent } from '../shared/app-events'

// main/app-events.ts의 앱 전체 통로(appEvents)는 log.ts(electron app)를 쓴다. 이 시험은 createAppEvents만 본다
vi.mock('electron', () => ({ app: { getPath: () => '' } }))

const { createAppEvents } = await import('./app-events')

const copied: AppEvent = {
  type: 'prompt-copied',
  masking: 'restore',
  masked: [{ category: 'client', count: 1 }],
  target: 'Claude'
}

describe('createAppEvents: 앱 일 전달 통로', () => {
  it('on 두 개가 모두 받는다(등록한 순서대로)', () => {
    const log = vi.fn()
    const events = createAppEvents(log)
    const got: string[] = []
    events.on((e) => got.push(`a:${e.type}`))
    events.on((e) => got.push(`b:${e.type}`))
    events.emit(copied)
    events.emit({ type: 'unmasked', restored: 2 })
    expect(got).toEqual(['a:prompt-copied', 'b:prompt-copied', 'a:unmasked', 'b:unmasked'])
    expect(log).not.toHaveBeenCalled()
  })

  it('첫째가 예외를 내도 둘째가 받고, 예외는 종류만 기록한다(글·이름 없음)', () => {
    const log = vi.fn()
    const events = createAppEvents(log)
    const second = vi.fn()
    events.on(() => {
      throw new Error('가상자동차 Claude 고객사명 1건')
    })
    events.on(second)
    expect(() => events.emit(copied)).not.toThrow()
    expect(second).toHaveBeenCalledWith(copied)
    expect(log.mock.calls).toEqual([['app.events.listenerError', { type: 'prompt-copied' }]])
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/가상자동차|Claude|고객사명/)
  })

  it('해제 뒤에는 받지 않고, 두 번 해제해도 다른 받는 쪽은 그대로다', () => {
    const events = createAppEvents(vi.fn())
    const a = vi.fn()
    const b = vi.fn()
    const offA = events.on(a)
    events.on(b)
    offA()
    offA()
    events.emit(copied)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('같은 함수를 두 번 등록하면 두 번 받고, 해제는 하나씩', () => {
    const events = createAppEvents(vi.fn())
    const cb = vi.fn()
    const off1 = events.on(cb)
    events.on(cb)
    events.emit(copied)
    expect(cb).toHaveBeenCalledTimes(2)
    off1()
    events.emit(copied)
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('받는 중에 해제한 받는 쪽은 그 일부터 받지 않고, 받는 중에 등록한 쪽은 다음 일부터 받는다', () => {
    const events = createAppEvents(vi.fn())
    const late = vi.fn()
    const b = vi.fn()
    let offB = (): void => {}
    events.on(() => {
      offB()
      events.on(late)
    })
    offB = events.on(b)
    events.emit(copied)
    expect(b).not.toHaveBeenCalled()
    expect(late).not.toHaveBeenCalled()
    events.emit({ type: 'unmasked', restored: 1 })
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('받는 쪽이 없어도 된다', () => {
    expect(() => createAppEvents(vi.fn()).emit(copied)).not.toThrow()
  })

  it('앱 전체 통로 appEvents가 하나 있다(emit을 그대로 넘길 수 있다)', async () => {
    const { appEvents } = await import('./app-events')
    const cb = vi.fn()
    const off = appEvents.on(cb)
    const emit = appEvents.emit
    emit({ type: 'capture-failed', reason: 'terminal' })
    off()
    expect(cb).toHaveBeenCalledWith({ type: 'capture-failed', reason: 'terminal' })
  })
})
