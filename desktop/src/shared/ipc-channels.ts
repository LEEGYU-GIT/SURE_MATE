import type { MaskingMode, PaletteItem } from './types'

/** main ↔ renderer 채널 이름 */
export const IPC = {
  paletteShown: 'palette:shown',
  paletteHide: 'palette:hide',
  paletteRunItem: 'palette:run-item',
  paletteListItems: 'palette:list-items',
  appGetStatus: 'app:get-status',
  devSaveImeLog: 'dev:save-ime-log'
} as const

/** 팔레트를 보여 줄 때 renderer에 넘기는 값 */
export type ShownPayload = { mode: 'search' } | { mode: 'dev-output'; title: string; text: string }

/** paletteHotkey: 실제로 등록된 팔레트 단축키. 하나도 못 잡았으면 null */
export type AppStatus = { paletteHotkey: string | null; maskingMode: MaskingMode }

/** preload가 window.sureMate로 노출하는 API */
export interface SureMateApi {
  hide(): void
  runItem(id: string): Promise<void>
  /** 팔레트에 보일 항목(프롬프트·명령 등) */
  listItems(): Promise<PaletteItem[]>
  getStatus(): Promise<AppStatus>
  onShown(cb: (payload: ShownPayload) => void): () => void
  /** 개발용: 한글 입력 기록을 logs 폴더에 저장하고 경로를 돌려준다 */
  saveImeLog(label: string, json: string): Promise<string>
}
