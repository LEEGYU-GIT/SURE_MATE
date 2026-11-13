import { expect, it } from 'vitest'
import { DEFAULT_PET_SETTINGS, PET_NUDGE_MINUTES, sanitizePetSettings, WALK_SPEED } from './pet-settings'

it('기본값과 걷는 속도', () => {
  expect(DEFAULT_PET_SETTINGS).toEqual({
    visible: true,
    size: 56,
    activity: 'normal',
    sleepAfterMin: 3,
    bubbles: true,
    reactions: true,
    nudges: true,
    nudgeEveryMin: 60,
    controlHotkey: null,
    reduceMotion: false
  })
  expect(WALK_SPEED).toEqual({ calm: 40, normal: 60, lively: 90 })
})

it('쉬어 가기 말(2026-11-13): 켬·끔과 간격 30·45·60·90분. 예전 파일(필드 없음)과 틀린 값은 기본값(켬, 60분)', () => {
  expect(PET_NUDGE_MINUTES).toEqual([30, 45, 60, 90])
  // 쉬어 가기 말 전의 설정 파일
  const old = { visible: false, size: 72, activity: 'calm', sleepAfterMin: 10, bubbles: true, reactions: false, controlHotkey: 'Ctrl+Alt+P', reduceMotion: true }
  expect(sanitizePetSettings(old)).toEqual({ ...old, nudges: true, nudgeEveryMin: 60 })
  for (const m of PET_NUDGE_MINUTES) expect(sanitizePetSettings({ nudgeEveryMin: m }).nudgeEveryMin).toBe(m)
  for (const bad of [0, 50, 61, 120, '60', 60.5, null]) expect(sanitizePetSettings({ nudgeEveryMin: bad }).nudgeEveryMin, String(bad)).toBe(60)
  expect(sanitizePetSettings({ nudges: false }).nudges).toBe(false)
  expect(sanitizePetSettings({ nudges: 'no' }).nudges).toBe(true)
})

it('undefined는 기본값과 같다', () => {
  expect(sanitizePetSettings(undefined)).toEqual(DEFAULT_PET_SETTINGS)
  expect(sanitizePetSettings('x')).toEqual(DEFAULT_PET_SETTINGS)
})

it('size는 40·56·72만 받는다', () => {
  expect(sanitizePetSettings({ size: 64 }).size).toBe(56)
  expect(sanitizePetSettings({ size: '56' }).size).toBe(56)
  expect(sanitizePetSettings({ size: 40 }).size).toBe(40)
  expect(sanitizePetSettings({ size: 72 }).size).toBe(72)
})

it('activity는 세 값만 받는다', () => {
  expect(sanitizePetSettings({ activity: 'fast' }).activity).toBe('normal')
  expect(sanitizePetSettings({ activity: 'calm' }).activity).toBe('calm')
  expect(sanitizePetSettings({ activity: 'lively' }).activity).toBe('lively')
})

it('sleepAfterMin은 1~60 정수', () => {
  expect(sanitizePetSettings({ sleepAfterMin: 0 }).sleepAfterMin).toBe(1)
  expect(sanitizePetSettings({ sleepAfterMin: 999 }).sleepAfterMin).toBe(60)
  expect(sanitizePetSettings({ sleepAfterMin: 2.6 }).sleepAfterMin).toBe(3)
  expect(sanitizePetSettings({ sleepAfterMin: 'x' }).sleepAfterMin).toBe(3)
})

it('controlHotkey는 다듬은 문자열 또는 null', () => {
  for (const v of ['', '   ', 5, 'a'.repeat(65), null]) expect(sanitizePetSettings({ controlHotkey: v }).controlHotkey).toBeNull()
  expect(sanitizePetSettings({ controlHotkey: ' Ctrl+Alt+P ' }).controlHotkey).toBe('Ctrl+Alt+P')
  expect(sanitizePetSettings({ controlHotkey: 'a'.repeat(64) }).controlHotkey).toBe('a'.repeat(64))
})

it('불리언 칸에 문자열이 오면 기본값', () => {
  const s = sanitizePetSettings({ visible: 'no', bubbles: 'no', reactions: 'no', reduceMotion: 'yes' })
  expect(s).toEqual(DEFAULT_PET_SETTINGS)
  expect(sanitizePetSettings({ visible: false, bubbles: false, reactions: false, reduceMotion: true })).toMatchObject({ visible: false, bubbles: false, reactions: false, reduceMotion: true })
})
