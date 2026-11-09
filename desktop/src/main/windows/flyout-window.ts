import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { Rect } from '../../shared/types'
import type { FlyoutWindowPort } from '../flyout/flyout-controller'
import { loadRoute, overlayWindowOptions, raiseOverlay } from './overlay-window'

const toInt = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })

/**
 * 숨긴 펼침 창을 두는 화면 밖 자리(DIP). 배율 400%에서도 물리 좌표가 -32000 안쪽이다.
 *
 * 펼침 창은 숨길 때 hide()하지 않는다. 화면에 '숨김'을 알려 내용을 바로 감추고(움직임 없음), PARK_DELAY_MS 뒤
 * 클릭 통과로 바꿔 보이는 채 여기로 옮긴다. 다시 보일 때(setBounds·showInactive) 옮기기를 취소하고 클릭 통과를 푼다.
 * 까닭: Windows에서 포커스를 받지 않는 창을 누른 직후 hide() → showInactive()를 하면, 그 뒤 이 창의 마우스 누름
 * (WM_LBUTTONDOWN)이 오지 않고 뗌만 와서 메뉴 행을 두 번째부터 누를 수 없었다(t18 스모크, 2026-11-09).
 * 누름 뒤 0.15초 지연 + hide, 포커스 막기, mouseLeave 보내기, 클릭 통과 + hide, 지연 없이 화면 밖으로 옮기기는 모두 그대로였고
 * hide 없이 0.15초 뒤 클릭 통과 + 화면 밖으로 옮길 때만 세 번 연속 눌렸다. 느린 PC를 생각해 0.3초를 둔다.
 */
const PARK = -8000
const PARK_DELAY_MS = 300

/** 바 옆 펼침 창(이름표·메뉴·위키 카드, 설계 문서 §9·§14-1). 클릭만 받고 키보드 입력은 받지 않는다 */
export function createFlyoutWindow(): { win: BrowserWindow; port: FlyoutWindowPort; hwnd: string } {
  const win = new BrowserWindow({ ...overlayWindowOptions(join(__dirname, '../preload/index.js')), width: 360, height: 200 })
  win.setAlwaysOnTop(true, 'screen-saver')
  const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0).toString()
  loadRoute(win, '/flyout')

  let parked = false
  let parkTimer: ReturnType<typeof setTimeout> | null = null
  const park = (): void => {
    const b = win.getBounds()
    if (b.x !== PARK || b.y !== PARK) win.setBounds({ x: PARK, y: PARK, width: b.width, height: b.height })
  }
  const cancelPark = (): void => {
    if (parkTimer !== null) clearTimeout(parkTimer)
    parkTimer = null
  }
  // 모니터 구성이 바뀌어 Windows가 화면 밖 창을 안으로 옮기면 다시 내보낸다(숨긴 내용이 비치지 않게)
  win.on('move', () => {
    if (parked && !win.isDestroyed()) park()
  })

  const port: FlyoutWindowPort = {
    setBounds: (r) => {
      if (win.isDestroyed()) return
      cancelPark()
      parked = false
      win.setBounds(toInt(r))
    },
    getBounds: () => win.getBounds(),
    showInactive: () => {
      if (win.isDestroyed()) return
      cancelPark()
      win.setIgnoreMouseEvents(false)
      // 처음 한 번만 실제로 띄운다. 그 뒤로는 늘 보이는 채 자리(setBounds)만 바뀐다
      if (!win.isVisible()) win.showInactive()
    },
    hide: () => {
      if (win.isDestroyed()) return
      win.webContents.send(IPC.flyoutHidden)
      cancelPark()
      parkTimer = setTimeout(() => {
        parkTimer = null
        if (win.isDestroyed()) return
        parked = true
        win.setIgnoreMouseEvents(true)
        park()
      }, PARK_DELAY_MS)
    },
    // 내용이 바뀌면 맨 앞으로(§9)
    raise: () => raiseOverlay(win, hwnd),
    send: (m) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.flyoutContent, m)
    },
    shown: (seq) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.flyoutShown, seq)
    }
  }
  return { win, port, hwnd }
}
