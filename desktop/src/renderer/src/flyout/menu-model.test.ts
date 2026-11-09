import { describe, expect, it } from 'vitest'
import { barShapeLabel, maskingModeLabel } from '../../../shared/labels'
import { barMenuRows, labelParts, maskingMenuRows } from './menu-model'

describe('가명 처리 메뉴', () => {
  it('끔이면 3행이고 끔 행만 선택·주의(warn)이며, 행마다 그 모드로 바꾸는 동작', () => {
    const rows = maskingMenuRows('off')
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.action)).toEqual([
      { type: 'set-masking', mode: 'off' },
      { type: 'set-masking', mode: 'restore' },
      { type: 'set-masking', mode: 'remove' }
    ])
    expect(rows.filter((r) => r.checked).map((r) => r.action)).toEqual([{ type: 'set-masking', mode: 'off' }])
    expect(rows.filter((r) => r.tone === 'warn').map((r) => r.action)).toEqual([{ type: 'set-masking', mode: 'off' }])
  })

  it('제목은 모드 이름(labels.ts)이고, 끔 행은 색만이 아니라 글로도 원문이 나간다고 알린다(§14-4)', () => {
    const rows = maskingMenuRows('restore')
    expect(rows.map((r) => r.title)).toEqual([maskingModeLabel('off'), maskingModeLabel('restore'), maskingModeLabel('remove')])
    expect(rows[0].detail).toContain('원문 그대로')
    for (const r of rows) expect(r.detail, r.key).toBeTruthy()
  })

  it('다른 모드면 그 행만 선택이고, 끔 행은 선택되지 않아도 주의 표시를 유지한다', () => {
    const rows = maskingMenuRows('remove')
    expect(rows.map((r) => r.checked)).toEqual([false, false, true])
    expect(rows.map((r) => r.tone)).toEqual(['warn', 'normal', 'normal'])
  })

  it('행 key는 서로 다르다', () => {
    const keys = maskingMenuRows('restore').map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('바 메뉴', () => {
  it('캡슐이면 캡슐 행만 선택, 잠시 숨기기·설정 열기 행이 있고, 끄기 행은 모양을 끔으로 바꾼다', () => {
    const rows = barMenuRows('capsule')
    expect(rows.filter((r) => r.checked).map((r) => r.action)).toEqual([{ type: 'set-bar-shape', shape: 'capsule' }])
    expect(rows.map((r) => r.action)).toContainEqual({ type: 'snooze-bar' })
    expect(rows.map((r) => r.action)).toContainEqual({ type: 'open-settings' })
    const off = rows.find((r) => r.action.type === 'set-bar-shape' && r.action.shape === 'off')
    expect(off?.action).toEqual({ type: 'set-bar-shape', shape: 'off' })
    // 바를 끄면 이 메뉴도 사라지므로 다시 켜는 곳을 글로 알린다
    expect(off?.detail).toMatch(/트레이/)
  })

  it('모양 세 행이 먼저(가장자리 띠·떠 있는 캡슐·끄기), 그다음 잠시 숨기기·설정 열기', () => {
    const rows = barMenuRows('edge')
    expect(rows.map((r) => r.action.type)).toEqual(['set-bar-shape', 'set-bar-shape', 'set-bar-shape', 'snooze-bar', 'open-settings'])
    expect(rows.slice(0, 2).map((r) => r.title)).toEqual([barShapeLabel('edge'), barShapeLabel('capsule')])
    expect(rows.map((r) => r.checked)).toEqual([true, false, false, false, false])
    expect(rows.every((r) => r.tone === 'normal')).toBe(true)
    const keys = rows.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('이름표 나누기', () => {
  it('마지막 " · " 뒤를 보조 글로 나누고, 단축키인지 알려 준다', () => {
    expect(labelParts('팔레트 열기 · Alt+`')).toEqual({ name: '팔레트 열기', hint: 'Alt+`', hintIsKey: true })
    expect(labelParts('회의록 정리 · 선택한 글로 실행')).toEqual({ name: '회의록 정리', hint: '선택한 글로 실행', hintIsKey: false })
    expect(labelParts('팔레트 열기 · Ctrl+Alt+Space')).toEqual({ name: '팔레트 열기', hint: 'Ctrl+Alt+Space', hintIsKey: true })
  })

  it('이름 안의 " · "는 이름에 남는다(보조 글은 맨 뒤 하나)', () => {
    expect(labelParts('보고서 · 주간 · 선택한 글로 실행')).toEqual({ name: '보고서 · 주간', hint: '선택한 글로 실행', hintIsKey: false })
  })

  it('구분이 없거나 한쪽이 비면 나누지 않는다', () => {
    expect(labelParts('가명 처리: 끔')).toEqual({ name: '가명 처리: 끔', hint: null, hintIsKey: false })
    expect(labelParts('설정')).toEqual({ name: '설정', hint: null, hintIsKey: false })
    expect(labelParts('이름 · ')).toEqual({ name: '이름 · ', hint: null, hintIsKey: false })
    expect(labelParts(' · Alt+`')).toEqual({ name: ' · Alt+`', hint: null, hintIsKey: false })
  })
})
