import type { GlossaryEntry, WikiDraft, WikiSaveResult } from './glossary/types'
import type { MaskItem } from './masking/types'
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
  /** 시작 가명 처리 모드(템플릿 기본값, 없으면 전체 기본값) */
  masking: MaskingMode
}

export interface PromptRequest {
  source: PromptSource
  /** source가 input일 때 직접 입력한 글 */
  input?: string
  target: string
  /** 이번 실행에서 고른 가명 처리 모드(없으면 템플릿·전체 기본값) */
  masking?: MaskingMode
  /** 이번 실행에서 끈 항목(MaskItem.key) */
  disabledKeys?: string[]
}

export interface PromptPreview {
  text: string
  /** 미리 보기를 앞부분만 잘랐는지 */
  truncated: boolean
  inputLength: number
  warnings: string[]
  /** 알아 두면 좋은 안내(경고보다 흐리게 보인다) */
  notes: string[]
  /** text 안에서 넣은 글의 [시작, 끝) 위치(형광펜) */
  highlights: [number, number][]
  /** 이번 미리 보기에 쓴 가명 처리 모드와 찾은 항목 */
  masking: { mode: MaskingMode; items: MaskItem[] }
  /** text 안에서 가린 표시의 [시작, 끝) 위치 */
  maskRanges: [number, number][]
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
  wikiGet: 'wiki:get',
  wikiCopy: 'wiki:copy',
  wikiOpenLink: 'wiki:open-link',
  wikiSave: 'wiki:save',
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
  /** 용어 하나(없으면 null) */
  getWikiEntry(id: string): Promise<GlossaryEntry | null>
  /** 설명을 클립보드에 넣고 팔레트를 닫는다 */
  copyWikiDefinition(id: string): Promise<boolean>
  /** 그 용어의 index번째 링크를 연다(http/https만) */
  openWikiLink(id: string, index: number): Promise<boolean>
  /** 용어를 추가하거나(id 없음) 고친다. 같은 이름이 있으면 duplicate로 먼저 알린다 */
  saveWikiEntry(draft: WikiDraft, o: { id?: string; allowDuplicate: boolean }): Promise<WikiSaveResult>
  onShown(cb: (payload: ShownPayload) => void): () => void
  /** 개발용: 한글 입력 기록을 logs 폴더에 저장하고 경로를 돌려준다 */
  saveImeLog(label: string, json: string): Promise<string>
}
