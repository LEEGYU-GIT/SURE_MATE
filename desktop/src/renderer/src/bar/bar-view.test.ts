import { describe, expect, it } from 'vitest'
import { barFrameStyle, createDragReporter, maskingLook, promptIcon } from './bar-view'

describe('barFrameStyle', () => {
  it('가장자리 띠는 너비 56이고 안쪽 모서리만 8로 둥글다', () => {
    expect(barFrameStyle({ shape: 'edge', edge: 'right', opacity: 1 })).toEqual({ width: 56, borderRadius: '8px 0 0 8px', '--bar-opacity': '1' })
    expect(barFrameStyle({ shape: 'edge', edge: 'left', opacity: 1 })).toEqual({ width: 56, borderRadius: '0 8px 8px 0', '--bar-opacity': '1' })
  })

  it('떠 있는 캡슐은 너비 44이고 완전히 둥글다(양쪽 가장자리 모두)', () => {
    expect(barFrameStyle({ shape: 'capsule', edge: 'right', opacity: 1 })).toEqual({ width: 44, borderRadius: '9999px', '--bar-opacity': '1' })
    expect(barFrameStyle({ shape: 'capsule', edge: 'left', opacity: 1 }).borderRadius).toBe('9999px')
  })

  it('투명도 설정은 --bar-opacity 문자열로 넘긴다', () => {
    expect(barFrameStyle({ shape: 'edge', edge: 'right', opacity: 0.7 })['--bar-opacity']).toBe('0.7')
    expect(barFrameStyle({ shape: 'capsule', edge: 'left', opacity: 0.6 })['--bar-opacity']).toBe('0.6')
  })
})

describe('maskingLook', () => {
  it('끔은 끊긴 방패·주황 점·"끔" 글자(색만으로 알리지 않는다)', () => {
    expect(maskingLook('off')).toEqual({ icon: 'shield-off', dot: 'warn', caption: '끔' })
  })

  it('되돌리기·빼기는 방패와 청록 점, 글자 없음', () => {
    expect(maskingLook('restore')).toEqual({ icon: 'shield', dot: 'brand', caption: null })
    expect(maskingLook('remove')).toEqual({ icon: 'shield', dot: 'brand', caption: null })
  })
})

describe('promptIcon', () => {
  it('기본 고정 프롬프트 세 개는 템플릿 id로 Lucide 아이콘을 고른다', () => {
    expect(promptIcon('meeting-notes')).toBe('notebook-pen')
    expect(promptIcon('req-to-testcase')).toBe('list-checks')
    expect(promptIcon('static-analysis')).toBe('scan-search')
  })

  it('그 밖의 템플릿은 글자 칸(null)', () => {
    expect(promptIcon('weekly-report')).toBeNull()
    expect(promptIcon('')).toBeNull()
    expect(promptIcon('constructor')).toBeNull()
  })
})

describe('createDragReporter', () => {
  function setup(): {
    sent: [string, number][]
    flush(): void
    pending(): number
    r: ReturnType<typeof createDragReporter>
  } {
    const sent: [string, number][] = []
    let queue = new Map<number, () => void>()
    let next = 1
    const r = createDragReporter((phase, y) => sent.push([phase, y]), {
      request: (cb) => {
        queue.set(next, cb)
        return next++
      },
      cancel: (id) => {
        queue.delete(id)
      }
    })
    return {
      sent,
      r,
      pending: () => queue.size,
      flush: () => {
        const q = queue
        queue = new Map()
        for (const cb of q.values()) cb()
      }
    }
  }

  it('시작은 바로 보내고, 한 프레임 안의 이동은 마지막 위치 한 번만 보낸다', () => {
    const t = setup()
    t.r.start(100)
    expect(t.sent).toEqual([['start', 100]])
    t.r.move(101)
    t.r.move(105)
    t.r.move(110)
    expect(t.pending()).toBe(1)
    expect(t.sent).toEqual([['start', 100]])
    t.flush()
    expect(t.sent).toEqual([
      ['start', 100],
      ['move', 110]
    ])
    t.r.move(120)
    t.flush()
    expect(t.sent.at(-1)).toEqual(['move', 120])
  })

  it('끝낼 때 기다리던 이동을 먼저 보내고 끝을 보낸다', () => {
    const t = setup()
    t.r.start(100)
    t.r.move(140)
    t.r.end(150)
    expect(t.pending()).toBe(0)
    expect(t.sent).toEqual([
      ['start', 100],
      ['move', 150],
      ['end', 150]
    ])
  })

  it('이미 보낸 위치에서 끝나면 이동을 다시 보내지 않는다', () => {
    const t = setup()
    t.r.start(100)
    t.r.move(130)
    t.flush()
    t.r.end(130)
    expect(t.sent).toEqual([
      ['start', 100],
      ['move', 130],
      ['end', 130]
    ])
  })

  it('누르고 그대로 떼면 시작과 끝만 보낸다', () => {
    const t = setup()
    t.r.start(100)
    t.r.end(100)
    expect(t.sent).toEqual([
      ['start', 100],
      ['end', 100]
    ])
  })

  it('끝은 한 번만, 시작 전이나 끝난 뒤의 이동·끝은 무시한다', () => {
    const t = setup()
    t.r.move(10)
    t.r.end(10)
    expect(t.sent).toEqual([])
    t.r.start(100)
    t.r.end(100)
    t.r.end(100)
    t.r.move(200)
    t.flush()
    expect(t.sent).toEqual([
      ['start', 100],
      ['end', 100]
    ])
    expect(t.r.active()).toBe(false)
  })

  it('끄는 중에 다시 누르면(다른 포인터) 무시한다', () => {
    const t = setup()
    t.r.start(100)
    t.r.start(300)
    expect(t.sent).toEqual([['start', 100]])
    expect(t.r.active()).toBe(true)
  })

  it('dispose는 기다리던 프레임을 취소한다', () => {
    const t = setup()
    t.r.start(100)
    t.r.move(120)
    t.r.dispose()
    expect(t.pending()).toBe(0)
    t.flush()
    expect(t.sent).toEqual([['start', 100]])
  })
})
