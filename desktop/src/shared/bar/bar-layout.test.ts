import { describe, expect, it } from 'vitest'
import builtin from '../../../resources/prompts.json'
import type { MonitorInfo, Rect } from '../types'
import { buildBarItems } from './bar-items'
import { barRect, barSize, BAR_METRICS, DEFAULT_BAR_RATIO, dragTop, fitBarItems, handleRect, itemOffsets, pickBarDisplay, ratioFromTop } from './bar-layout'

const templates = builtin.templates as { id: string; name: string; kind: 'prompt' | 'snippet' }[]
const mk = (pinned: string[]) => buildBarItems({ pinned, templates, maskingMode: 'restore', petVisible: true, paletteHotkey: null })
const items = mk(['meeting-notes', 'req-to-testcase', 'static-analysis'])
const full: Rect = { x: 0, y: 0, width: 1920, height: 1040 }
const five = ['meeting-notes', 'req-to-testcase', 'static-analysis', 'polish', 'weekly-report']

describe('크기', () => {
  it('상수', () => {
    expect(DEFAULT_BAR_RATIO).toBe(0.5)
    expect(BAR_METRICS.edge.width).toBe(56)
    expect(BAR_METRICS.hoverScale).toBe(1.15)
  })
  it('barSize', () => {
    expect(barSize(items, 'edge')).toEqual({ width: 56, height: 456 })
    expect(barSize(items, 'capsule')).toEqual({ width: 44, height: 428 })
  })
  it('itemOffsets는 구분선을 뺀다', () => {
    const o = itemOffsets(items, 'edge')
    expect(o).toHaveLength(9)
    expect(o.find((x) => x.id === 'masking')).toEqual({ id: 'masking', top: 52, height: 40 })
    expect(o.find((x) => x.id === 'prompt:meeting-notes')).toEqual({ id: 'prompt:meeting-notes', top: 112, height: 40 })
    expect(o.find((x) => x.id === 'settings')).toEqual({ id: 'settings', top: 408, height: 40 })
  })
})

describe('fitBarItems (작은 화면)', () => {
  it('1280x720 125%: 작업 영역 538 - 24 = 514 → 앞 4개만', () => {
    const it5 = mk(five)
    expect(barSize(it5, 'edge').height).toBe(544)
    const fit = fitBarItems(it5, 'edge', 514)
    expect(fit.filter((i) => i.kind === 'prompt').map((i) => i.id)).toEqual(five.slice(0, 4).map((id) => `prompt:${id}`))
    expect(barSize(fit, 'edge').height).toBe(500)
  })
  it('320이면 프롬프트 0개이고 구분선 규칙 유지', () => {
    const fit = fitBarItems(mk(five), 'edge', 320)
    expect(fit.map((i) => i.kind)).toEqual(['logo', 'masking', 'separator', 'workspace', 'glossary', 'separator', 'pet', 'settings'])
    expect(barSize(fit, 'edge').height).toBe(308)
    expect(new Set(fit.map((i) => i.id)).size).toBe(fit.length)
  })
  it('들어가면 그대로', () => {
    expect(fitBarItems(items, 'edge', 1000)).toEqual(items)
  })
})

describe('barRect', () => {
  const s = barSize(items, 'edge')
  const c = barSize(items, 'capsule')
  it('띠·오른쪽', () => {
    expect(barRect({ workArea: full, shape: 'edge', edge: 'right', size: s, ratio: 0.5 })).toEqual({ x: 1864, y: 292, width: 56, height: 456 })
  })
  it('캡슐·왼쪽·보조 모니터', () => {
    expect(barRect({ workArea: { x: -1280, y: 100, width: 1280, height: 984 }, shape: 'capsule', edge: 'left', size: c, ratio: 0.5 })).toEqual({ x: -1268, y: 378, width: 44, height: 428 })
  })
  it('캡슐·오른쪽은 12 띄움', () => {
    expect(barRect({ workArea: full, shape: 'capsule', edge: 'right', size: c, ratio: 0 })).toEqual({ x: 1864, y: 12, width: 44, height: 428 })
  })
  it('작업 표시줄이 왼쪽이면 작업 영역 끝에 붙는다', () => {
    expect(barRect({ workArea: { x: 48, y: 0, width: 1872, height: 1080 }, shape: 'edge', edge: 'left', size: s, ratio: 0.5 }).x).toBe(48)
  })
  it('작업 표시줄이 위쪽이면 y가 작업 영역 기준', () => {
    const r = barRect({ workArea: { x: 0, y: 40, width: 1920, height: 1040 }, shape: 'edge', edge: 'right', size: s, ratio: 0 })
    expect(r.y).toBe(52)
  })
  it('작업 영역보다 크면 위쪽 여백에 맞춘다', () => {
    expect(barRect({ workArea: { x: 0, y: 0, width: 1920, height: 300 }, shape: 'edge', edge: 'right', size: s, ratio: 1 }).y).toBe(12)
  })
  it('손잡이는 두 모양 모두 작업 영역 끝', () => {
    expect(handleRect({ x: 1864, y: 292, width: 56, height: 456 }, 'right', full)).toEqual({ x: 1914, y: 292, width: 6, height: 456 })
    expect(handleRect({ x: 12, y: 292, width: 44, height: 428 }, 'left', full)).toEqual({ x: 0, y: 292, width: 6, height: 428 })
    expect(handleRect({ x: 60, y: 10, width: 56, height: 100 }, 'left', { x: 48, y: 0, width: 1872, height: 1080 }).x).toBe(48)
  })
})

describe('세로 위치', () => {
  it('ratioFromTop', () => {
    expect(ratioFromTop(292, 456, full)).toBe(0.5)
    expect(ratioFromTop(-50, 456, full)).toBe(0)
    expect(ratioFromTop(5000, 456, full)).toBe(1)
    expect(ratioFromTop(12, 2000, full)).toBe(0)
  })
  it('dragTop 한계', () => {
    const o = { startTop: 292, startY: 500, height: 456, workArea: full }
    expect(dragTop({ ...o, y: -500 })).toBe(12)
    expect(dragTop({ ...o, y: 1500 })).toBe(572)
    expect(dragTop({ ...o, y: 600 })).toBe(392)
  })
})

describe('pickBarDisplay', () => {
  const m = (id: string, isPrimary: boolean): MonitorInfo => ({ id, bounds: full, workArea: full, scaleFactor: 1, isPrimary, isInternal: false })
  const list = [m('1', true), m('2', false)]
  it('고른 모니터', () => expect(pickBarDisplay(list, '2')?.id).toBe('2'))
  it('없으면 주 모니터', () => {
    expect(pickBarDisplay(list, '9')?.id).toBe('1')
    expect(pickBarDisplay(list, 'primary')?.id).toBe('1')
  })
  it('빈 목록', () => expect(pickBarDisplay([], 'primary')).toBeNull())
  it('주 모니터 표시가 없으면 첫 모니터', () => expect(pickBarDisplay([m('3', false)], 'primary')?.id).toBe('3'))
})
