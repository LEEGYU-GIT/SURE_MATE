import { expect, it } from 'vitest'
import { DEFAULT_PET_SETTINGS, PET_AWAY_LEAD_MINUTES, PET_AWAY_MINUTES, PET_NUDGE_MINUTES, sanitizePetSettings, WALK_SPEED } from './pet-settings'

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
    awayWarn: true,
    awayAfterMin: 20,
    awayLeadMin: 2,
    controlHotkey: null,
    reduceMotion: false
  })
  expect(WALK_SPEED).toEqual({ calm: 40, normal: 60, lively: 90 })
})

it('쉬어 가기 말(2026-11-13): 켬·끔과 간격 30·45·60·90분. 예전 파일(필드 없음)과 틀린 값은 기본값(켬, 60분)', () => {
  expect(PET_NUDGE_MINUTES).toEqual([30, 45, 60, 90])
  // 쉬어 가기 말 전의 설정 파일
  const old = { visible: false, size: 72, activity: 'calm', sleepAfterMin: 10, bubbles: true, reactions: false, controlHotkey: 'Ctrl+Alt+P', reduceMotion: true }
  expect(sanitizePetSettings(old)).toEqual({ ...old, nudges: true, nudgeEveryMin: 60, awayWarn: true, awayAfterMin: 20, awayLeadMin: 2 })
  for (const m of PET_NUDGE_MINUTES) expect(sanitizePetSettings({ nudgeEveryMin: m }).nudgeEveryMin).toBe(m)
  for (const bad of [0, 50, 61, 120, '60', 60.5, null]) expect(sanitizePetSettings({ nudgeEveryMin: bad }).nudgeEveryMin, String(bad)).toBe(60)
  expect(sanitizePetSettings({ nudges: false }).nudges).toBe(false)
  expect(sanitizePetSettings({ nudges: 'no' }).nudges).toBe(true)
})

it('이석 미리 알림(2026-11-13): 켬·끔, 기준 10·15·20·30분, 미리 1·2·3·5분 전. 예전 파일(필드 없음)과 틀린 값은 기본값(켬, 20분, 2분 전)', () => {
  expect(PET_AWAY_MINUTES).toEqual([10, 15, 20, 30])
  expect(PET_AWAY_LEAD_MINUTES).toEqual([1, 2, 3, 5])
  const old = sanitizePetSettings({ nudges: false, nudgeEveryMin: 30 })
  expect(old).toMatchObject({ awayWarn: true, awayAfterMin: 20, awayLeadMin: 2 })
  for (const m of PET_AWAY_MINUTES) expect(sanitizePetSettings({ awayAfterMin: m }).awayAfterMin).toBe(m)
  for (const m of PET_AWAY_LEAD_MINUTES) expect(sanitizePetSettings({ awayLeadMin: m }).awayLeadMin).toBe(m)
  for (const bad of [0, 5, 25, 60, '20', 20.5, null]) expect(sanitizePetSettings({ awayAfterMin: bad }).awayAfterMin, String(bad)).toBe(20)
  for (const bad of [0, 4, 10, '2', 2.5, null]) expect(sanitizePetSettings({ awayLeadMin: bad }).awayLeadMin, String(bad)).toBe(2)
  expect(sanitizePetSettings({ awayWarn: false }).awayWarn).toBe(false)
  expect(sanitizePetSettings({ awayWarn: 'no' }).awayWarn).toBe(true)
  // 미리 알림은 늘 기준보다 짧다(가장 짧은 기준 10분 > 가장 긴 미리 알림 5분)
  expect(Math.min(...PET_AWAY_MINUTES)).toBeGreaterThan(Math.max(...PET_AWAY_LEAD_MINUTES))
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
