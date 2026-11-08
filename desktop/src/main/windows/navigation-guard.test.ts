import { expect, it } from 'vitest'
import { lockNavigation, type NavigableContents } from './navigation-guard'

type Listener = (event: { preventDefault(): void }, ...args: unknown[]) => void

function fakeContents(): { wc: NavigableContents; emit(event: string, url: string): boolean; open(url: string): unknown } {
  const listeners = new Map<string, Listener[]>()
  let openHandler: ((details: { url: string }) => unknown) | null = null
  const wc: NavigableContents = {
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener as Listener])
      return wc
    },
    setWindowOpenHandler(handler) {
      openHandler = handler
    }
  }
  return {
    wc,
    emit(event, url) {
      let prevented = false
      for (const l of listeners.get(event) ?? []) l({ preventDefault: () => (prevented = true) }, url)
      return prevented
    },
    open: (url) => openHandler?.({ url })
  }
}

it('파일을 끌어다 놓거나 링크를 눌러도 창이 다른 주소로 이동하지 않는다', () => {
  const f = fakeContents()
  lockNavigation(f.wc)
  expect(f.emit('will-navigate', 'file:///C:/Users/me/Desktop/report.txt')).toBe(true)
  expect(f.emit('will-navigate', 'https://example.com/')).toBe(true)
})

it('새 창을 열지 않는다', () => {
  const f = fakeContents()
  lockNavigation(f.wc)
  expect(f.open('https://example.com/')).toEqual({ action: 'deny' })
})
