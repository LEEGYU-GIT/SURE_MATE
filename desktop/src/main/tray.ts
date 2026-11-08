import { Menu, Tray, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'
import { trayTooltip } from '../shared/labels'

export interface TrayOptions {
  /** 실제로 등록된 팔레트 단축키. 하나도 못 잡았으면 null */
  paletteHotkey: () => string | null
  maskingLabel: () => string
  onOpenPalette: () => void
  /** 단축키 일시 중지를 켜고 끈다. 바뀐 뒤 상태(true = 중지됨)를 돌려준다. */
  onToggleSuspend: () => boolean
  onQuit: () => void
}

/** refresh()는 단축키·가명 처리 모드가 바뀐 뒤 툴팁과 메뉴를 다시 그린다. */
export function createTray(o: TrayOptions): { tray: Tray; refresh: () => void } {
  const tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  let suspended = false

  const refresh = (): void => {
    tray.setToolTip(trayTooltip(o.paletteHotkey(), suspended))
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '팔레트 열기', click: o.onOpenPalette },
        { label: `가명 처리: ${o.maskingLabel()}`, enabled: false },
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
