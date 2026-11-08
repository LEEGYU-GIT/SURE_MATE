import { expect, it } from 'vitest'
import { trayTooltip } from './labels'

it('트레이 툴팁은 실제로 등록된 팔레트 단축키와 가명 처리 모드를 보여 준다', () => {
  expect(trayTooltip('Alt+`', false, 'restore')).toBe('Sure-Mate · 팔레트 Alt+` · 가명 처리: 가명 후 되돌리기')
  expect(trayTooltip(null, false, 'remove')).toBe('Sure-Mate · 팔레트 단축키 없음 · 가명 처리: 결과에서 빼기')
  expect(trayTooltip('Alt+`', true, 'off')).toBe('Sure-Mate · 팔레트 Alt+` (단축키 일시 중지) · 가명 처리: 끔')
})
