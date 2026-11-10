import type { MonitorInfo } from '../types'

export const P: MonitorInfo = {
  id: '1',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
  isPrimary: true,
  isInternal: false
}
export const L: MonitorInfo = {
  id: '2',
  bounds: { x: -1920, y: 0, width: 1920, height: 1200 },
  workArea: { x: -1920, y: 0, width: 1920, height: 1152 },
  scaleFactor: 1.5,
  isPrimary: false,
  isInternal: true
}
