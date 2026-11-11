import { expect, it } from 'vitest'
import { isSettingsTabId, routeOfHash, SETTINGS_TAB_IDS, settingsHash, tabFromHash } from './settings-route'

it('탭 id: 설계 §14 순서, 말랑 메이트 탭이 있다, 겹치지 않는다', () => {
  expect(SETTINGS_TAB_IDS).toEqual(['general', 'hotkeys', 'ai', 'prompts', 'masking', 'glossary', 'bar', 'pet'])
  expect(new Set(SETTINGS_TAB_IDS).size).toBe(SETTINGS_TAB_IDS.length)
  expect(isSettingsTabId('pet')).toBe(true)
  for (const bad of ['workspace', 'Pet', '', null, 3, 'pet?x']) expect(isSettingsTabId(bad)).toBe(false)
})

it('주소의 # 뒤: 탭은 설정 창에만 붙고, 첫 실행 안내에는 붙지 않는다', () => {
  expect(settingsHash('/settings', 'pet')).toBe('/settings?tab=pet')
  expect(settingsHash('/settings')).toBe('/settings')
  expect(settingsHash('/settings', null)).toBe('/settings')
  expect(settingsHash('/onboarding', 'pet')).toBe('/onboarding')
})

it('처음 열 탭: 설정 창 주소의 알려진 탭만, 나머지는 null(일반 탭으로 연다)', () => {
  expect(tabFromHash('#/settings?tab=pet')).toBe('pet')
  expect(tabFromHash('/settings?tab=bar')).toBe('bar')
  for (const hash of ['#/settings', '#/settings?tab=', '#/settings?tab=workspace', '#/settings?tab=pet&x=1', '#/onboarding?tab=pet', '#/pet', '', '#/settings?tab=__proto__'])
    expect(tabFromHash(hash), hash).toBeNull()
})

it('화면 고르기: # 뒤의 경로만(물음표 뒤는 뗀다)', () => {
  expect(routeOfHash('#/settings?tab=pet')).toBe('/settings')
  expect(routeOfHash('#/settings')).toBe('/settings')
  expect(routeOfHash('#/bar')).toBe('/bar')
  expect(routeOfHash('')).toBe('')
})
