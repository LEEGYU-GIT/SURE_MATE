import { expect, it } from 'vitest'
import { barShapeLabel, trayTooltip } from './labels'

it('트레이 툴팁은 실제로 등록된 팔레트 단축키와 가명 처리 모드를 보여 준다', () => {
  expect(trayTooltip('Alt+`', false, 'restore')).toBe('Sure-Mate · 팔레트 Alt+` · 가명 처리: 바꾸고 되돌리기')
  expect(trayTooltip(null, false, 'remove')).toBe('Sure-Mate · 팔레트 단축키 없음 · 가명 처리: 바꾸기만')
  expect(trayTooltip('Alt+`', true, 'off')).toBe('Sure-Mate · 팔레트 Alt+` (단축키 일시 중지) · 가명 처리: 끔')
})

it('바 모양 이름(바 메뉴·트레이·팔레트 명령이 같이 쓴다)', () => {
  expect(barShapeLabel('edge')).toBe('가장자리 띠')
  expect(barShapeLabel('capsule')).toBe('떠 있는 캡슐')
  expect(barShapeLabel('off')).toBe('끔')
})
