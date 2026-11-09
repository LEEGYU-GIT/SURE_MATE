import { Menu, Tray, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'
import type { BarShape } from '../shared/bar/bar-settings'
import { barShapeLabel, maskingModeLabel, trayTooltip } from '../shared/labels'
import type { MaskingMode } from '../shared/types'

export interface TrayOptions {
  /** 실제로 등록된 팔레트 단축키. 하나도 못 잡았으면 null */
  paletteHotkey: () => string | null
  maskingMode: () => MaskingMode
  onOpenPalette: () => void
  barShape: () => BarShape
  /** 트레이 메뉴에서 고른 바 모양(저장하고 잠시 숨김을 푼다는 약속은 부르는 쪽이 지킨다) */
  onBarShape: (shape: BarShape) => void
  /** 바가 잠시 숨김(30분) 중인지 */
  barSnoozed: () => boolean
  onUnsnooze: () => void
  /** 단축키 일시 중지를 켜고 끈다. 바뀐 뒤 상태(true = 중지됨)를 돌려준다. */
  onToggleSuspend: () => boolean
  onQuit: () => void
}

const BAR_SHAPES: BarShape[] = ['edge', 'capsule', 'off']

/** refresh()는 단축키·가명 처리 모드가 바뀐 뒤 툴팁과 메뉴를 다시 그린다. */
export function createTray(o: TrayOptions): { tray: Tray; refresh: () => void } {
  const tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  let suspended = false

  const refresh = (): void => {
    tray.setToolTip(trayTooltip(o.paletteHotkey(), suspended, o.maskingMode()))
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '팔레트 열기', click: o.onOpenPalette },
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
        { type: 'separator' },
        {
          label: '단축키 일시 중지',
          type: 'checkbox',
          checked: suspended,
          click: () => {
            suspended = o.onToggleSuspend()
            refresh()
          }
        },
        { type: 'separator' },
        { label: '종료', click: o.onQuit }
      ])
    )
  }

  refresh()
  tray.on('click', o.onOpenPalette)
  return { tray, refresh }
}
