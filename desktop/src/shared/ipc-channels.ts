import type { MaskingMode } from './types'

/** main ↔ renderer 채널 이름 */
export const IPC = {
  paletteShown: 'palette:shown',
  paletteHide: 'palette:hide',
  paletteRunItem: 'palette:run-item',
  appGetStatus: 'app:get-status'
} as const

/** 팔레트를 보여 줄 때 renderer에 넘기는 값 */
export type ShownPayload = { mode: 'search' } | { mode: 'dev-output'; title: string; text: string }

export type AppStatus = { paletteHotkey: string; maskingMode: MaskingMode }

/** preload가 window.sureMate로 노출하는 API */
export interface SureMateApi {
  hide(): void
  runItem(id: string): Promise<void>
  getStatus(): Promise<AppStatus>
  onShown(cb: (payload: ShownPayload) => void): () => void
}
