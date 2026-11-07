import { screen } from 'electron'
import type { MonitorInfo, Rect } from '../../shared/types'

// Electron screen·BrowserWindow 좌표(DIP)와 Win32 물리 픽셀 사이의 변환은 여기서만 한다.

export const toPhysical = (dipRect: Rect): Rect => screen.dipToScreenRect(null, dipRect)

export const toDip = (physicalRect: Rect): Rect => screen.screenToDipRect(null, physicalRect)

export function getMonitors(): MonitorInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d) => ({
    id: String(d.id),
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === primaryId,
    isInternal: d.internal
  }))
}

/** 물리 픽셀 사각형이 가장 많이 걸친 모니터 */
export function monitorOfPhysicalRect(physicalRect: Rect): MonitorInfo {
  const id = String(screen.getDisplayMatching(toDip(physicalRect)).id)
  const monitors = getMonitors()
  return monitors.find((m) => m.id === id) ?? monitors[0]
}
