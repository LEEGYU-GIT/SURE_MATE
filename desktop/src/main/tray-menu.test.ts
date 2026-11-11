import { expect, it, vi } from 'vitest'
import { trayMenuTemplate, type TrayMenuOptions } from './tray-menu'

const options = (over: Partial<TrayMenuOptions> = {}): TrayMenuOptions => ({
  maskingMode: () => 'restore',
  onOpenPalette: vi.fn(),
  onOpenSettings: vi.fn(),
  barShape: () => 'edge',
  onBarShape: vi.fn(),
  barSnoozed: () => false,
  onUnsnooze: vi.fn(),
  petVisible: () => true,
  onPetVisible: vi.fn(),
  onQuit: vi.fn(),
  ...over
})

it('트레이 메뉴의 "설정"은 "팔레트 열기" 바로 다음이고 누르면 설정 창을 연다', () => {
  const o = options()
  const items = trayMenuTemplate(o, { suspended: false, onToggleSuspend: vi.fn() })
  expect(items.map((i) => i.label ?? i.type)).toEqual(['팔레트 열기', '설정', '가명 처리: 가명 후 되돌리기', 'separator', 'Sure-Mate 바', '말랑 메이트 보이기', 'separator', '단축키 일시 중지', 'separator', '종료'])
  ;(items[1].click as () => void)()
  expect(o.onOpenSettings).toHaveBeenCalledOnce()
  expect(o.onOpenPalette).not.toHaveBeenCalled()
})

it('단축키 일시 중지는 지금 상태를 체크로 보이고, 누르면 넘겨받은 함수를 부른다', () => {
  const onToggleSuspend = vi.fn()
  const items = trayMenuTemplate(options(), { suspended: true, onToggleSuspend })
  const item = items.find((i) => i.label === '단축키 일시 중지')
  expect(item).toMatchObject({ type: 'checkbox', checked: true })
  ;(item?.click as () => void)()
  expect(onToggleSuspend).toHaveBeenCalledOnce()
})

it('바를 잠시 숨겼으면 바 하위 메뉴 맨 위에 "바 다시 보이기"', () => {
  const items = trayMenuTemplate(options({ barSnoozed: () => true }), { suspended: false, onToggleSuspend: vi.fn() })
  const sub = items.find((i) => i.label === 'Sure-Mate 바')?.submenu as { label?: string }[]
  expect(sub[0].label).toBe('바 다시 보이기')
})

it('"말랑 메이트 보이기"는 지금 상태를 체크로 보이고, 누르면 바뀐 값을 넘긴다', () => {
  const onPetVisible = vi.fn()
  const items = trayMenuTemplate(options({ petVisible: () => false, onPetVisible }), { suspended: false, onToggleSuspend: vi.fn() })
  const item = items.find((i) => i.label === '말랑 메이트 보이기')
  expect(item).toMatchObject({ type: 'checkbox', checked: false })
  ;(item?.click as (mi: { checked: boolean }) => void)({ checked: true })
  expect(onPetVisible).toHaveBeenCalledWith(true)
})
