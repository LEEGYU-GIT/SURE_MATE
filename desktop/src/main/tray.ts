import { Menu, Tray, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'

export interface TrayOptions {
  tooltip: () => string
  maskingLabel: () => string
  onOpenPalette: () => void
  /** 단축키 일시 중지를 켜고 끈다. 바뀐 뒤 상태(true = 중지됨)를 돌려준다. */
  onToggleSuspend: () => boolean
  onQuit: () => void
}

export function createTray(o: TrayOptions): Tray {
  const tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  let suspended = false

  const rebuild = (): void => {
    tray.setToolTip(o.tooltip() + (suspended ? ' (단축키 일시 중지)' : ''))
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
            rebuild()
          }
        },
        { type: 'separator' },
        { label: '종료', click: o.onQuit }
      ])
    )
  }

  rebuild()
  tray.on('click', o.onOpenPalette)
  return tray
}
