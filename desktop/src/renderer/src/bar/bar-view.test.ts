import { describe, expect, it } from 'vitest'
import {
  BAR_DOWN_STALE_MS,
  BAR_REPEAT_MS,
  barFrameStyle,
  createBarPress,
  createDragReporter,
  maskingLook,
  promptIcon,
  shouldSendBarClick,
  type BarPress
} from './bar-view'

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

describe('shouldSendBarClick: 운영 체제의 두 번 클릭 가운데 두 번째 클릭은 보내지 않는다', () => {
  it('한 번 클릭(detail 1)은 보낸다', () => {
    expect(shouldSendBarClick(1)).toBe(true)
  })

  it('두 번 클릭의 두 번째(detail 2), 세 번 클릭(detail 3)은 보내지 않는다(0.3~0.5초 간격은 main의 300ms 막기를 지난다)', () => {
    expect(shouldSendBarClick(2)).toBe(false)
    expect(shouldSendBarClick(3)).toBe(false)
  })

  it('클릭 횟수가 없는 클릭(detail 0: 보조 기술·프로그램이 누름)은 보낸다', () => {
    expect(shouldSendBarClick(0)).toBe(true)
  })
})

describe('createBarPress: 바 단추는 뗌으로 실행한다', () => {
  function setup(): { p: BarPress; advance(ms: number): void } {
    let t = 1000
    return {
      p: createBarPress(() => t),
      advance: (ms: number) => {
        t += ms
      }
    }
  }

  it('누르고 같은 단추에서 떼면 실행하고(up), 뒤따르는 click은 건너뛴다', () => {
    const s = setup()
    s.p.down('pet', 0)
    s.advance(80)
    expect(s.p.up('pet', 0, true)).toBe('up')
    s.advance(2)
    expect(s.p.click('pet', 1)).toBeNull()
  })

  it('누름이 오지 않고 뗌만 와도 실행한다(up-only: 2026-11-16 로그인 뒤 Windows가 바에 누름을 보내지 않았다)', () => {
    const s = setup()
    expect(s.p.up('pet', 0, true)).toBe('up-only')
  })

  it('뗌 없이 온 click(화면 읽기 프로그램·자동화)은 실행하고, 그 click의 두 번째(detail 2)는 보내지 않는다', () => {
    const s = setup()
    expect(s.p.click('settings', 0)).toBe('click')
    s.advance(BAR_REPEAT_MS + 1)
    expect(s.p.click('settings', 1)).toBe('click')
    s.advance(BAR_REPEAT_MS + 1)
    expect(s.p.click('settings', 2)).toBeNull()
  })

  it('두 번 클릭의 두 번째·세 번째 뗌은 실행하지 않고, 두 번 클릭 시간이 지나면 다시 실행한다', () => {
    const s = setup()
    s.p.down('logo', 0)
    expect(s.p.up('logo', 0, true)).toBe('up')
    s.advance(300)
    s.p.down('logo', 0)
    expect(s.p.up('logo', 0, true)).toBeNull()
    s.advance(300)
    s.p.down('logo', 0)
    expect(s.p.up('logo', 0, true)).toBeNull()
    s.advance(BAR_REPEAT_MS + 1)
    s.p.down('logo', 0)
    expect(s.p.up('logo', 0, true)).toBe('up')
  })

  it('다른 단추는 바로 이어 눌러도 실행한다', () => {
    const s = setup()
    expect(s.p.up('masking', 0, true)).toBe('up-only')
    s.advance(100)
    expect(s.p.up('workspace', 0, true)).toBe('up-only')
  })

  it('다른 단추에서 눌러 여기서 떼거나, 단추 밖에서 떼면 실행하지 않는다', () => {
    const s = setup()
    s.p.down('masking', 0)
    expect(s.p.up('pet', 0, true)).toBeNull()
    s.p.down('pet', 0)
    expect(s.p.up('pet', 0, false)).toBeNull()
  })

  it('뗌을 놓친 오래된 누름이나 바를 떠나며 버린 누름은 다음 뗌을 막지 않는다', () => {
    const s = setup()
    s.p.down('masking', 0)
    s.advance(BAR_DOWN_STALE_MS + 1)
    expect(s.p.up('pet', 0, true)).toBe('up-only')
    s.advance(BAR_REPEAT_MS + 1)
    s.p.down('masking', 0)
    s.p.reset()
    expect(s.p.up('settings', 0, true)).toBe('up-only')
  })

  it('왼쪽 버튼이 아니면 누름·뗌 모두 무시한다', () => {
    const s = setup()
    s.p.down('pet', 2)
    expect(s.p.up('pet', 2, true)).toBeNull()
    expect(s.p.up('pet', 1, true)).toBeNull()
    expect(s.p.click('pet', 1)).toBe('click')
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
