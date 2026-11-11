import type { MenuItemConstructorOptions } from 'electron'
import type { BarShape } from '../shared/bar/bar-settings'
import { barShapeLabel, maskingModeLabel } from '../shared/labels'
import type { MaskingMode } from '../shared/types'

export interface TrayMenuOptions {
  maskingMode: () => MaskingMode
  onOpenPalette: () => void
  /** 설정 창을 연다 */
  onOpenSettings: () => void
  barShape: () => BarShape
  /** 트레이 메뉴에서 고른 바 모양(저장하고 잠시 숨김을 푼다는 약속은 부르는 쪽이 지킨다) */
  onBarShape: (shape: BarShape) => void
  /** 바가 잠시 숨김(30분) 중인지 */
  barSnoozed: () => boolean
  onUnsnooze: () => void
  /** 말랑 메이트가 보이는지 */
  petVisible: () => boolean
  /** 트레이 체크 항목에서 바꾼 보이기 값(저장은 부르는 쪽이 한다) */
  onPetVisible: (visible: boolean) => void
  onQuit: () => void
}

const BAR_SHAPES: BarShape[] = ['edge', 'capsule', 'off']

/** 트레이 메뉴 항목(Electron 없이 시험할 수 있게 tray.ts에서 뗐다) */
export function trayMenuTemplate(o: TrayMenuOptions, s: { suspended: boolean; onToggleSuspend: () => void }): MenuItemConstructorOptions[] {
  return [
    { label: '팔레트 열기', click: o.onOpenPalette },
    { label: '설정', click: o.onOpenSettings },
    { label: `가명 처리: ${maskingModeLabel(o.maskingMode())}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Sure-Mate 바',
      submenu: [
        ...(o.barSnoozed() ? [{ label: '바 다시 보이기', click: o.onUnsnooze }, { type: 'separator' as const }] : []),
        ...BAR_SHAPES.map((shape) => ({
          label: barShapeLabel(shape),
          type: 'radio' as const,
          checked: o.barShape() === shape,
          click: () => o.onBarShape(shape)
        }))
      ]
    },
    { label: '말랑 메이트 보이기', type: 'checkbox', checked: o.petVisible(), click: (item) => o.onPetVisible(item.checked) },
    { type: 'separator' },
    { label: '단축키 일시 중지', type: 'checkbox', checked: s.suspended, click: s.onToggleSuspend },
    { type: 'separator' },
    { label: '종료', click: o.onQuit }
  ]
}
