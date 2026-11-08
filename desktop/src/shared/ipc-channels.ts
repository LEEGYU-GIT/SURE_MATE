import type { CaptureSkipReason, MaskingMode, PaletteItem } from './types'

/** 프롬프트에 넣을 글의 출처 */
export type PromptSource = 'selection' | 'clipboard' | 'input'

/** 확인 화면에 보낼 값. 선택한 글은 길이만 보내고 내용은 main에 둔다. */
export interface PromptDraft {
  templateId: string
  name: string
  group?: string
  selection: { length: number; skipped?: CaptureSkipReason | 'nothing-selected' }
  clipboardLength: number
  defaultSource: PromptSource
  targets: { id: string; name: string }[]
  target: string
}

export interface PromptRequest {
  source: PromptSource
  /** source가 input일 때 직접 입력한 글 */
  input?: string
  target: string
}

export interface PromptPreview {
  text: string
  /** 미리 보기를 앞부분만 잘랐는지 */
  truncated: boolean
  inputLength: number
  warnings: string[]
}

export interface PromptRunResult {
  ok: boolean
  message: string
}

/** main ↔ renderer 채널 이름 */
export const IPC = {
  paletteShown: 'palette:shown',
  paletteHide: 'palette:hide',
  paletteRunItem: 'palette:run-item',
  paletteListItems: 'palette:list-items',
  promptPreview: 'prompt:preview',
  promptRun: 'prompt:run',
  promptCancel: 'prompt:cancel',
  appGetStatus: 'app:get-status',
  devSaveImeLog: 'dev:save-ime-log'
} as const

/** 팔레트를 보여 줄 때 renderer에 넘기는 값 */
export type ShownPayload =
  | { mode: 'search' }
  | { mode: 'dev-output'; title: string; text: string }
  | { mode: 'confirm'; draft: PromptDraft }

/** paletteHotkey: 실제로 등록된 팔레트 단축키. 하나도 못 잡았으면 null. aiTargetName: 기본 AI 대상 이름 */
export type AppStatus = { paletteHotkey: string | null; maskingMode: MaskingMode; aiTargetName: string }

/** preload가 window.sureMate로 노출하는 API */
export interface SureMateApi {
  hide(): void
  runItem(id: string): Promise<void>
  /** 팔레트에 보일 항목(프롬프트·명령 등) */
  listItems(): Promise<PaletteItem[]>
  /** 확인 화면 미리 보기(가명 처리는 M3에서 여기에 들어간다) */
  previewPrompt(req: PromptRequest): Promise<PromptPreview>
  /** 복사하고 AI 대상을 연다 */
  runPrompt(req: PromptRequest): Promise<PromptRunResult>
  /** 확인 화면을 벗어날 때 세션을 버린다 */
  cancelPrompt(): void
  getStatus(): Promise<AppStatus>
  onShown(cb: (payload: ShownPayload) => void): () => void
  /** 개발용: 한글 입력 기록을 logs 폴더에 저장하고 경로를 돌려준다 */
  saveImeLog(label: string, json: string): Promise<string>
}
