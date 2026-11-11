import { expect, it } from 'vitest'
import { isSettingsTabId, routeOfHash, SETTINGS_TAB_IDS, settingsHash, tabFromHash, workspaceFromHash } from './settings-route'

it('탭 id: 설계 §14 순서(용어 사전 다음 워크스페이스, 그다음 바), 말랑 메이트 탭이 있다, 겹치지 않는다', () => {
  expect(SETTINGS_TAB_IDS).toEqual(['general', 'hotkeys', 'ai', 'prompts', 'masking', 'glossary', 'workspace', 'bar', 'pet'])
  expect(new Set(SETTINGS_TAB_IDS).size).toBe(SETTINGS_TAB_IDS.length)
  expect(isSettingsTabId('pet')).toBe(true)
  expect(isSettingsTabId('workspace')).toBe(true)
  for (const bad of ['workspaces', 'Pet', '', null, 3, 'pet?x']) expect(isSettingsTabId(bad)).toBe(false)
})

it('주소의 # 뒤: 탭은 설정 창에만 붙고, 첫 실행 안내에는 붙지 않는다', () => {
  expect(settingsHash('/settings', 'pet')).toBe('/settings?tab=pet')
  expect(settingsHash('/settings')).toBe('/settings')
  expect(settingsHash('/settings', null)).toBe('/settings')
  expect(settingsHash('/onboarding', 'pet')).toBe('/onboarding')
})

it('워크스페이스 탭은 열 워크스페이스 id를 붙일 수 있다(형식이 맞는 id만, 다른 탭에는 붙지 않는다)', () => {
  expect(settingsHash('/settings', 'workspace', 'ws-qa')).toBe('/settings?tab=workspace&ws=ws-qa')
  expect(settingsHash('/settings', 'workspace', '0f8fad5b-d9cb-469f-a165-70867728950e')).toBe('/settings?tab=workspace&ws=0f8fad5b-d9cb-469f-a165-70867728950e')
  expect(settingsHash('/settings', 'workspace')).toBe('/settings?tab=workspace')
  expect(settingsHash('/settings', 'workspace', null)).toBe('/settings?tab=workspace')
  for (const bad of ['a/b', 'a&tab=pet', '', 'x'.repeat(65), 'ws qa']) expect(settingsHash('/settings', 'workspace', bad), bad).toBe('/settings?tab=workspace')
  expect(settingsHash('/settings', 'pet', 'ws-qa')).toBe('/settings?tab=pet')
  expect(settingsHash('/onboarding', 'workspace', 'ws-qa')).toBe('/onboarding')
})

it('처음 열 탭: 설정 창 주소의 알려진 탭만, 나머지는 null(일반 탭으로 연다)', () => {
  expect(tabFromHash('#/settings?tab=pet')).toBe('pet')
  expect(tabFromHash('/settings?tab=bar')).toBe('bar')
  expect(tabFromHash('#/settings?tab=workspace')).toBe('workspace')
  expect(tabFromHash('#/settings?tab=workspace&ws=ws-qa')).toBe('workspace')
  for (const hash of [
    '#/settings',
    '#/settings?tab=',
    '#/settings?tab=workspaces',
    '#/settings?tab=pet&x=1',
    '#/settings?tab=pet&ws=ws-qa',
    '#/settings?tab=workspace&ws=a/b',
    '#/settings?tab=workspace&ws=',
    '#/settings?tab=workspace&ws=ws-qa&x=1',
    '#/onboarding?tab=pet',
    '#/pet',
    '',
    '#/settings?tab=__proto__'
  ])
    expect(tabFromHash(hash), hash).toBeNull()
})

it('처음 열 워크스페이스: 워크스페이스 탭 주소의 형식이 맞는 id만, 나머지는 null(목록을 연다)', () => {
  expect(workspaceFromHash('#/settings?tab=workspace&ws=ws-qa')).toBe('ws-qa')
  expect(workspaceFromHash('/settings?tab=workspace&ws=A-1')).toBe('A-1')
  for (const hash of ['#/settings?tab=workspace', '#/settings?tab=pet&ws=ws-qa', '#/settings?tab=workspace&ws=a_b', `#/settings?tab=workspace&ws=${'a'.repeat(65)}`, '#/onboarding', ''])
    expect(workspaceFromHash(hash), hash).toBeNull()
})

it('화면 고르기: # 뒤의 경로만(물음표 뒤는 뗀다)', () => {
  expect(routeOfHash('#/settings?tab=pet')).toBe('/settings')
  expect(routeOfHash('#/settings?tab=workspace&ws=ws-qa')).toBe('/settings')
  expect(routeOfHash('#/settings')).toBe('/settings')
  expect(routeOfHash('#/bar')).toBe('/bar')
  expect(routeOfHash('')).toBe('')
})
