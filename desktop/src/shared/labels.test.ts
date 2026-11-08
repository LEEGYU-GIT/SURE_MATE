import { expect, it } from 'vitest'
import { trayTooltip } from './labels'

it('트레이 툴팁은 실제로 등록된 팔레트 단축키를 보여 주고, 없으면 단축키 없음', () => {
  expect(trayTooltip('Alt+`', false)).toBe('Sure-Mate · 팔레트 Alt+`')
  expect(trayTooltip(null, false)).toBe('Sure-Mate · 팔레트 단축키 없음')
  expect(trayTooltip('Alt+`', true)).toBe('Sure-Mate · 팔레트 Alt+` (단축키 일시 중지)')
})
