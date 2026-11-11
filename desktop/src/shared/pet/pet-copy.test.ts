import { describe, expect, it } from 'vitest'
import type { AppEvent } from '../app-events'
import { CAPTURE_NOTES } from '../labels'
import { ALL_CATEGORIES, type MaskCategory } from '../masking/types'
import type { CaptureSkipReason } from '../types'
import {
  AI_NAME_MAX,
  PET_CATEGORY_NOUNS,
  PET_CONTROL_GUIDE,
  PET_CONTROL_KEY_ITEMS,
  PET_CONTROL_KEYS,
  PET_CRASH_NOTICE,
  petBubbleText,
  petMenuRows
} from './pet-copy'

type Copied = Extract<AppEvent, { type: 'prompt-copied' }>
const copied = (o: Partial<Copied> = {}): Copied => ({
  type: 'prompt-copied',
  masking: 'restore',
  masked: [],
  target: 'Claude',
  ...o
})
const m = (category: MaskCategory, count: number): { category: MaskCategory; count: number } => ({
  category,
  count
})

describe('petBubbleText: 복사 축하', () => {
  it('설계 예시 문장과 정확히 같다(건수·분류·AI 이름은 실제 값)', () => {
    expect(petBubbleText(copied({ masked: [m('client', 1)] }))).toBe(
      '복사했어요. 고객사명 1건은 가명으로 바꿨어요. Claude 창에 붙여넣어 주세요.'
    )
  })

  it('건수가 많은 순으로 두 개까지, 나머지는 " 외 {건수 합}건"', () => {
    const text = petBubbleText(
      copied({ masked: [m('client', 2), m('ip', 2), m('path', 3), m('email', 1)] })
    )
    expect(text).toContain('경로 3건·고객사명 2건 외 3건은 가명으로 바꿨어요')
    expect(text).toBe(
      '복사했어요. 경로 3건·고객사명 2건 외 3건은 가명으로 바꿨어요. Claude 창에 붙여넣어 주세요.'
    )
  })

  it('건수가 같으면 분류 순서(ALL_CATEGORIES)를 따른다. 받은 순서는 상관없다', () => {
    expect(petBubbleText(copied({ masked: [m('ip', 2), m('client', 2)] }))).toContain(
      '고객사명 2건·IP 2건은 가명으로'
    )
    expect(
      petBubbleText(copied({ masked: [m('url', 1), m('person', 1), m('phone', 1)] }))
    ).toContain('담당자명 1건·전화번호 1건 외 1건은')
  })

  it('두 분류면 "외"가 없고, 0건·같은 분류 중복은 합쳐서 센다', () => {
    expect(petBubbleText(copied({ masked: [m('project', 1), m('system', 4)] }))).toContain(
      '시스템명 4건·프로젝트명 1건은 가명으로'
    )
    expect(
      petBubbleText(
        copied({ masked: [m('client', 0), m('client', 1), m('client', 2), m('email', 0)] })
      )
    ).toContain('. 고객사명 3건은 가명으로')
  })

  it('천 건이 넘으면 쉼표로 묶는다', () => {
    expect(petBubbleText(copied({ masked: [m('path', 1200)] }))).toContain('경로 1,200건은')
  })

  it('가린 것이 없으면 가운데 문장을 뺀다', () => {
    expect(petBubbleText(copied({ masked: [] }))).toBe('복사했어요. Claude 창에 붙여넣어 주세요.')
    expect(petBubbleText(copied({ masked: [m('client', 0)] }))).toBe(
      '복사했어요. Claude 창에 붙여넣어 주세요.'
    )
  })

  it('복사만이면(target null) "원하는 곳에 붙여넣어 주세요."로 끝난다', () => {
    const text = petBubbleText(copied({ masked: [m('client', 1)], target: null }))
    expect(text).toBe('복사했어요. 고객사명 1건은 가명으로 바꿨어요. 원하는 곳에 붙여넣어 주세요.')
    expect(petBubbleText(copied({ target: null }))).toBe('복사했어요. 원하는 곳에 붙여넣어 주세요.')
  })

  it('결과에서 빼기 모드도 가명 처리 켬이다', () => {
    expect(petBubbleText(copied({ masking: 'remove', masked: [m('client', 1)] }))).toBe(
      '복사했어요. 고객사명 1건은 가명으로 바꿨어요. Claude 창에 붙여넣어 주세요.'
    )
  })

  it(`AI 이름은 공백을 하나로 줄이고, ${AI_NAME_MAX}자를 넘으면 줄임표로 자른다(끝 문장이 말풍선 4줄 안에 남게)`, () => {
    expect(petBubbleText(copied({ target: '  사내\n  AI   도우미 ' }))).toBe(
      '복사했어요. 사내 AI 도우미 창에 붙여넣어 주세요.'
    )
    const long = 'A'.repeat(AI_NAME_MAX + 5)
    expect(petBubbleText(copied({ target: long }))).toBe(
      `복사했어요. ${'A'.repeat(AI_NAME_MAX - 1)}… 창에 붙여넣어 주세요.`
    )
    expect(petBubbleText(copied({ target: 'B'.repeat(AI_NAME_MAX) }))).toBe(
      `복사했어요. ${'B'.repeat(AI_NAME_MAX)} 창에 붙여넣어 주세요.`
    )
    // 공백뿐인 이름은 복사만과 같다
    expect(petBubbleText(copied({ target: '   ' }))).toBe(
      '복사했어요. 원하는 곳에 붙여넣어 주세요.'
    )
  })
})

describe('petBubbleText: 경고·되돌리기·가져오기 실패(설계 원문)', () => {
  it('가명 처리 끔: 경고 원문(가린 항목이 와도 같다)', () => {
    expect(petBubbleText(copied({ masking: 'off' }))).toBe(
      '가명 처리가 꺼져 있어요. 이름이 그대로 들어갔어요.'
    )
    expect(petBubbleText(copied({ masking: 'off', masked: [m('client', 1)], target: null }))).toBe(
      '가명 처리가 꺼져 있어요. 이름이 그대로 들어갔어요.'
    )
  })

  it('되돌리기: 원문, 되돌린 것이 없으면 null', () => {
    expect(petBubbleText({ type: 'unmasked', restored: 3 })).toBe('원래 이름으로 되돌렸어요.')
    expect(petBubbleText({ type: 'unmasked', restored: 1 })).toBe('원래 이름으로 되돌렸어요.')
    expect(petBubbleText({ type: 'unmasked', restored: 0 })).toBeNull()
  })

  it('가져오기 실패: §10 안내 문구(CAPTURE_NOTES) + "."', () => {
    expect(petBubbleText({ type: 'capture-failed', reason: 'terminal' })).toBe(
      '터미널에서는 가져오지 않아요.'
    )
    expect(petBubbleText({ type: 'capture-failed', reason: 'nothing-selected' })).toBe(
      '선택한 글이 없어요.'
    )
    for (const reason of Object.keys(CAPTURE_NOTES) as (CaptureSkipReason | 'nothing-selected')[]) {
      expect(petBubbleText({ type: 'capture-failed', reason }), reason).toBe(
        `${CAPTURE_NOTES[reason]}.`
      )
    }
  })
})

describe('PET_CATEGORY_NOUNS', () => {
  it('모든 분류에 말풍선 이름이 있고, 고객사는 설계 예시대로 "고객사명"', () => {
    expect(Object.keys(PET_CATEGORY_NOUNS).sort()).toEqual([...ALL_CATEGORIES].sort())
    for (const c of ALL_CATEGORIES) expect(PET_CATEGORY_NOUNS[c].trim(), c).not.toBe('')
    expect(PET_CATEGORY_NOUNS).toEqual({
      client: '고객사명',
      project: '프로젝트명',
      person: '담당자명',
      system: '시스템명',
      ip: 'IP',
      path: '경로',
      email: '이메일',
      phone: '전화번호',
      url: '사내 URL'
    })
  })
})

describe('petMenuRows: 오른쪽 클릭 메뉴(설계 §14-2 "조종하기, 재우기, 숨기기, 펫 설정")', () => {
  it('깨어 있으면 조종하기·재우기·숨기기·펫 설정 4행', () => {
    expect(petMenuRows({ sleeping: false }).map((r) => [r.action, r.title])).toEqual([
      ['control', '조종하기'],
      ['sleep', '재우기'],
      ['hide', '숨기기'],
      ['settings', '펫 설정']
    ])
  })

  it('졸고 있으면 4행이고 두 번째 행이 깨우기', () => {
    const rows = petMenuRows({ sleeping: true })
    expect(rows).toHaveLength(4)
    expect(rows[1]).toEqual({ action: 'wake', title: '깨우기' })
    expect(rows.map((r) => r.action)).toEqual(['control', 'wake', 'hide', 'settings'])
  })

  it('설명(한 줄 행이라 화면 읽기용): 조종하기는 조종 키, 숨기기는 다시 부르는 곳. 나머지는 없음', () => {
    const [control, sleep, hide, settings] = petMenuRows({ sleeping: false })
    expect(control.detail).toBe(PET_CONTROL_KEYS)
    expect(hide.detail).toBe('바의 펫 단추나 트레이에서 다시 불러요')
    expect(sleep.detail).toBeUndefined()
    expect(settings.detail).toBeUndefined()
  })

  it('부를 때마다 새 배열(받는 쪽이 고쳐도 다음 메뉴에 남지 않음)', () => {
    expect(petMenuRows({ sleeping: false })).not.toBe(petMenuRows({ sleeping: false }))
  })
})

describe('조종 안내(메뉴 설명·조종 시작 말풍선·팔레트 부제가 같은 말)', () => {
  it('키 안내: ←→ 걷기 · Space 뛰기 · ↑↓ 바 오르내리기 · Esc 끝(설계 §14-2의 조종 키 전부)', () => {
    expect(PET_CONTROL_KEYS).toBe('←→ 걷기 · Space 뛰기 · ↑↓ 바 오르내리기 · Esc 끝')
    expect(PET_CONTROL_KEYS).toBe(PET_CONTROL_KEY_ITEMS.map(([k, v]) => `${k} ${v}`).join(' · '))
  })

  it('조종을 시작할 때 말풍선: 할 일 한 문장(굵게) + 키 안내', () => {
    expect(PET_CONTROL_GUIDE).toBe(`키보드로 조종해 보세요. ${PET_CONTROL_KEYS}`)
  })
})

describe('(Task 9 #6) 펫 화면이 다시 불러온 뒤에도 멈췄을 때 알림', () => {
  it('무슨 일이 있었는지와 다시 나오게 하는 방법(존댓말, 두 문장)', () => {
    expect(PET_CRASH_NOTICE).toBe('말랑 메이트 화면에 문제가 생겨 숨겼어요. 앱을 다시 켜면 다시 나와요.')
  })
})
