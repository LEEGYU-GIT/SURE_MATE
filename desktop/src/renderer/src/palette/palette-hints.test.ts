import { expect, it } from 'vitest'
import type { PaletteItem } from '../../../shared/types'
import { WIKI_ADD_ID, WORKSPACE_SAVE_AS_ID, type PaletteSearch } from './filter-items'
import { PALETTE_TIPS, rememberHint, tipFor } from './palette-hints'

const item = (id: string, group: PaletteItem['group']): PaletteItem => ({ id, group, title: id })
/** '보고서 띄워줘': 맨 위는 주간보고 프롬프트, 둘째가 보고서 모드 워크스페이스 */
const natural: PaletteSearch = {
  items: [item('prompt:weekly-report', 'prompt'), item('workspace:ws-report', 'workspace'), item('wiki:str', 'wiki')],
  top: { id: 'prompt:weekly-report', label: '프롬프트' },
  natural: true,
  key: '보고서띄워줘',
  recent: []
}

it('기억하기 안내: 말하듯 입력이고 학습 키가 있으며 맨 위가 아닌 실제 항목을 골랐을 때만', () => {
  expect(rememberHint(natural, 'workspace:ws-report')).toBe(true)
  expect(rememberHint(natural, 'wiki:str')).toBe(true)
  // 맨 위는 Enter로 이미 실행되는 항목이라 기억할 것이 없다
  expect(rememberHint(natural, 'prompt:weekly-report')).toBe(false)
  // 그냥 낱말(접두어 검색·빈 검색어 포함)이거나 키가 없는 짧은 글
  expect(rememberHint({ ...natural, natural: false }, 'workspace:ws-report')).toBe(false)
  expect(rememberHint({ ...natural, key: null }, 'workspace:ws-report')).toBe(false)
  // 목록 끝에 붙인 줄(직접 추가하기·이름으로 저장)과 목록에 없는 id
  expect(rememberHint(natural, WIKI_ADD_ID)).toBe(false)
  expect(rememberHint(natural, WORKSPACE_SAVE_AS_ID)).toBe(false)
  expect(rememberHint(natural, 'workspace:gone')).toBe(false)
  expect(rememberHint(natural, '')).toBe(false)
  expect(rememberHint({ ...natural, items: [], top: null }, 'workspace:ws-report')).toBe(false)
})

it('사용 팁: 팔레트를 보인 횟수마다 3개를 차례로(음수도 안전하게)', () => {
  expect(PALETTE_TIPS).toHaveLength(3)
  expect([0, 1, 2, 3, 4, 5].map(tipFor)).toEqual([...PALETTE_TIPS, ...PALETTE_TIPS])
  expect(tipFor(-1)).toBe(PALETTE_TIPS[2])
  expect(new Set(PALETTE_TIPS).size).toBe(3)
})

it('사용 팁은 자리표시자 없는 한 줄 문장이고 접두어 팁은 실제 접두어로 시작한다', () => {
  for (const tip of PALETTE_TIPS) {
    expect(tip).not.toMatch(/[{}]/)
    expect(tip).not.toContain('\n')
    expect(tip.trim()).toBe(tip)
    // 팔레트 너비(720)의 한 줄 안: 12px 글자 40자 이내
    expect([...tip].length).toBeLessThanOrEqual(40)
  }
  expect(PALETTE_TIPS.some((t) => t.startsWith('@'))).toBe(true)
  expect(PALETTE_TIPS.some((t) => t.startsWith('?'))).toBe(true)
  expect(PALETTE_TIPS[0]).toContain('‘회의록 정리해줘’')
})
