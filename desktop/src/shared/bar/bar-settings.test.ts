import { expect, it } from 'vitest'
import { BAR_LIMITS, DEFAULT_BAR_SETTINGS, nextBarShape, sanitizeBarSettings, withPosition } from './bar-settings'

it('undefined는 기본값과 같고 배열은 새 배열', () => {
  const s = sanitizeBarSettings(undefined)
  expect(s).toEqual(DEFAULT_BAR_SETTINGS)
  expect(s.pinnedPrompts).not.toBe(DEFAULT_BAR_SETTINGS.pinnedPrompts)
  expect(s.positions).not.toBe(DEFAULT_BAR_SETTINGS.positions)
  expect(DEFAULT_BAR_SETTINGS).toMatchObject({ shape: 'edge', edge: 'right', monitor: 'primary', autoHide: false, opacity: 1, wikiCardMs: 8000, wikiCardWidth: 360 })
  expect(DEFAULT_BAR_SETTINGS.pinnedPrompts).toEqual(['meeting-notes', 'req-to-testcase', 'static-analysis'])
})

it('모양·가장자리·모니터가 틀리면 기본값', () => {
  const s = sanitizeBarSettings({ shape: 'floating', edge: 'top', monitor: '' })
  expect([s.shape, s.edge, s.monitor]).toEqual(['edge', 'right', 'primary'])
  expect(sanitizeBarSettings({ monitor: 'x'.repeat(65) }).monitor).toBe('primary')
  expect(sanitizeBarSettings({ monitor: '2528732444', shape: 'capsule', edge: 'left' })).toMatchObject({ monitor: '2528732444', shape: 'capsule', edge: 'left' })
})

it('고정 프롬프트: 중복·빈 값·문자열 아닌 값 제거, 5개까지', () => {
  expect(sanitizeBarSettings({ pinnedPrompts: ['a', 'a', '', 3, 'b', 'c', 'd', 'e', 'f'] }).pinnedPrompts).toEqual(['a', 'b', 'c', 'd', 'e'])
  expect(sanitizeBarSettings({ pinnedPrompts: [] }).pinnedPrompts).toEqual([])
  expect(sanitizeBarSettings({ pinnedPrompts: 'x' }).pinnedPrompts).toEqual(DEFAULT_BAR_SETTINGS.pinnedPrompts)
  expect(sanitizeBarSettings({ pinnedPrompts: ['y'.repeat(200)] }).pinnedPrompts).toEqual([])
})

it('위치: 잘못된 항목 제거·비율 보정, 같은 display는 뒤의 것, 16개까지', () => {
  const raw = [{ display: '1', ratio: 0.3 }, { display: '2', ratio: 1.5 }, { display: '3', ratio: 'x' }, { display: '', ratio: 0.2 }]
  expect(sanitizeBarSettings({ positions: raw }).positions).toEqual([{ display: '1', ratio: 0.3 }, { display: '2', ratio: 1 }])
  const many = Array.from({ length: 20 }, (_, i) => ({ display: String(i), ratio: 0.5 }))
  const p = sanitizeBarSettings({ positions: many }).positions
  expect(p).toHaveLength(BAR_LIMITS.positions)
  expect(p[0].display).toBe('4')
  expect(p[15].display).toBe('19')
  expect(sanitizeBarSettings({ positions: [{ display: '1', ratio: 0.1 }, { display: '2', ratio: 0.2 }, { display: '1', ratio: 0.9 }] }).positions).toEqual([
    { display: '2', ratio: 0.2 },
    { display: '1', ratio: 0.9 }
  ])
  expect(sanitizeBarSettings({ positions: 'x' }).positions).toEqual([])
  expect(sanitizeBarSettings({ positions: [null, 5, { display: '1', ratio: -2 }, { display: '2', ratio: NaN }] }).positions).toEqual([{ display: '1', ratio: 0 }])
})

it('숫자 제한', () => {
  expect(sanitizeBarSettings({ opacity: 0.2 }).opacity).toBe(0.6)
  expect(sanitizeBarSettings({ opacity: 3 }).opacity).toBe(1)
  expect(sanitizeBarSettings({ opacity: 0.8 }).opacity).toBe(0.8)
  expect(sanitizeBarSettings({ opacity: '0.8' }).opacity).toBe(1)
  expect(sanitizeBarSettings({ wikiCardMs: 500 }).wikiCardMs).toBe(3000)
  expect(sanitizeBarSettings({ wikiCardMs: 999999 }).wikiCardMs).toBe(60000)
  expect(sanitizeBarSettings({ wikiCardMs: 8000.4 }).wikiCardMs).toBe(8000)
  expect(sanitizeBarSettings({ wikiCardMs: NaN }).wikiCardMs).toBe(8000)
  expect(sanitizeBarSettings({ wikiCardWidth: 100 }).wikiCardWidth).toBe(280)
  expect(sanitizeBarSettings({ wikiCardWidth: 9999 }).wikiCardWidth).toBe(560)
  expect(sanitizeBarSettings({ wikiCardWidth: 400.6 }).wikiCardWidth).toBe(401)
  expect(sanitizeBarSettings({ autoHide: true }).autoHide).toBe(true)
  expect(sanitizeBarSettings({ autoHide: 'yes' }).autoHide).toBe(false)
})

it('withPosition은 그 display를 지우고 맨 뒤에 추가하며 16개를 넘지 않는다', () => {
  const b = { ...DEFAULT_BAR_SETTINGS, positions: [{ display: '1', ratio: 0.1 }, { display: '2', ratio: 0.2 }] }
  const n = withPosition(b, '1', 0.7)
  expect(n.positions).toEqual([{ display: '2', ratio: 0.2 }, { display: '1', ratio: 0.7 }])
  expect(b.positions).toHaveLength(2)
  let x = DEFAULT_BAR_SETTINGS
  for (let i = 0; i < 20; i++) x = withPosition(x, String(i), 0.5)
  expect(x.positions).toHaveLength(16)
  expect(x.positions[15].display).toBe('19')
})

it('nextBarShape는 edge → capsule → off → edge', () => {
  expect(nextBarShape('edge')).toBe('capsule')
  expect(nextBarShape('capsule')).toBe('off')
  expect(nextBarShape('off')).toBe('edge')
})
