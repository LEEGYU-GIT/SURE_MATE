import type { BarViewState } from './bar/bar-items'
import type { FlyoutAction, FlyoutMessage } from './flyout/flyout-content'
import type { GlossaryEntry, WikiDraft, WikiSaveResult } from './glossary/types'
import type { MaskItem } from './masking/types'
import type { PetView } from './pet/pet-view'
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
  devSaveImeLog: 'dev:save-ime-log',
  /** 바 화면 → main(invoke): 지금 바 상태 */
  barGetState: 'bar:get-state',
  /** main → 바 화면: 바 상태가 바뀜 */
  barState: 'bar:state',
  /** 바 화면 → main(send) */
  barAction: 'bar:action',
  barHover: 'bar:hover',
  barPointer: 'bar:pointer',
  barContextMenu: 'bar:context-menu',
  barDrag: 'bar:drag',
  /** 펼침 창 → main(invoke): 지금 내용(창이 뜬 뒤 처음 한 번) */
  flyoutGetContent: 'flyout:get-content',
  /** main → 펼침 창: 새 내용, 또는 같은 seq로 그림자 여백만 바뀜 */
  flyoutContent: 'flyout:content',
  /** main → 펼침 창: 창을 배치하고 띄웠다(들어오는 움직임 시작) */
  flyoutShown: 'flyout:shown',
  /** main → 펼침 창: 창을 숨겼다(내용을 바로 감춘다. 창은 잠시 뒤 화면 밖으로 옮겨진다) */
  flyoutHidden: 'flyout:hidden',
  /** 펼침 창 → main(send) */
  flyoutReady: 'flyout:ready',
  flyoutPointer: 'flyout:pointer',
  /** 펼침 창 → main(invoke → boolean): 메뉴 행·카드 단추 */
  flyoutAction: 'flyout:action',
  /** 펫 창 → main(invoke): 지금 펫 화면 상태 */
  petGetView: 'pet:get-view',
  /** main → 펫 창: 펫 화면 상태가 바뀜 */
  petView: 'pet:view',
  /** 펫 창 → main(send): 펫 위에서 왼쪽 버튼 누름·뗌 */
  petPress: 'pet:press',
  /** 펫 창 → main(send): 펫 위에서 오른쪽 클릭 */
  petContextMenu: 'pet:context-menu'
} as const

/**
 * 팔레트를 보여 줄 때 renderer에 넘기는 값. search의 query는 시작 검색어(없으면 빈 칸, 바의 용어 사전 단추는 '?').
 * wiki는 위키 카드의 [팔레트에서 열기]: 빈 검색어로 그 용어 상세를 연다
 */
export type ShownPayload =
  | { mode: 'search'; query?: string }
  | { mode: 'dev-output'; title: string; text: string }
  | { mode: 'confirm'; draft: PromptDraft }
  | { mode: 'wiki'; id: string }

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
  /** 바 화면: 지금 바 상태(바가 없으면 null) */
  getBarState(): Promise<BarViewState | null>
  onBarState(cb: (s: BarViewState) => void): () => void
  /** 바 항목을 왼쪽 클릭했다 */
  barAction(id: string): void
  /** 마우스가 바 항목에 들어감(id) 또는 나감(null) */
  barHover(id: string | null): void
  /** 마우스가 바 창에 들어감·나감 */
  barPointer(inside: boolean): void
  /** 오른쪽 클릭. y는 바 창 안의 세로 위치(DIP) */
  barContextMenu(y: number): void
  /** 바의 빈 곳을 끌기. screenY는 화면 좌표(DIP) */
  barDrag(phase: 'start' | 'move' | 'end', screenY: number): void
  /** 펼침 창: 지금 내용(없으면 null) */
  getFlyoutContent(): Promise<FlyoutMessage | null>
  /** 새 내용, 또는 같은 seq로 그림자 여백(pad)만 바뀐 메시지 */
  onFlyoutContent(cb: (m: FlyoutMessage) => void): () => void
  /** main이 그 seq의 창을 배치하고 띄웠다 */
  onFlyoutShown(cb: (seq: number) => void): () => void
  /** main이 창을 숨겼다(창은 잠시 뒤 화면 밖으로 옮겨진다, flyout-park.ts) */
  onFlyoutHidden(cb: () => void): () => void
  /** 그 seq의 내용을 그렸고 크기(DIP)가 이렇다 */
  flyoutReady(seq: number, width: number, height: number): void
  /** 마우스가 펼침 창 내용에 들어감·나감 */
  flyoutPointer(inside: boolean): void
  /** 메뉴 행·카드 단추. main이 받아 처리했으면 true */
  flyoutAction(a: FlyoutAction): Promise<boolean>
  /** 펫 창: 지금 펫 화면 상태(펫이 없으면 null) */
  getPetView(): Promise<PetView | null>
  onPetView(cb: (v: PetView) => void): () => void
  /** 펫 위에서 왼쪽 버튼을 눌렀다(true)·뗐다(false). 클릭·끌기 판단은 main이 한다 */
  petPress(down: boolean): void
  /** 펫 위에서 오른쪽 클릭(펫 메뉴) */
  petContextMenu(): void
}
