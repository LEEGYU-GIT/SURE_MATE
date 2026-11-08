import { expect, it } from 'vitest'
import { preventFileDrop } from './drop-guard'

it('파일을 끌어다 놓아도 브라우저 기본 동작(그 파일 열기)을 하지 않는다', () => {
  const target = new EventTarget()
  preventFileDrop(target)
  for (const type of ['dragover', 'drop']) {
    const e = new Event(type, { cancelable: true })
    target.dispatchEvent(e)
    expect(e.defaultPrevented, type).toBe(true)
  }
})
