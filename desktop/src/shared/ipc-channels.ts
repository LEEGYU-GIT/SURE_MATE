import type { BarViewState } from './bar/bar-items'
import type { FlyoutAction, FlyoutMessage } from './flyout/flyout-content'
import type { GlossaryEntry, WikiDraft, WikiSaveResult } from './glossary/types'
import type { MaskTerm } from './masking/dictionary'
import type { Template } from './template/types'
import type { MaskItem } from './masking/types'
import type { SettingsPatch } from './settings/settings-patch'
import type { HotkeyCandidate, HotkeyCheck, HotkeySetResult, SettingsHotkeyId, SettingsSnapshot, SettingsUpdateResult } from './settings/settings-snapshot'
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
  /** 설정 창 → main(invoke): 지금 설정과 화면에 필요한 상태 */
  settingsGet: 'settings:get',
  /** 설정 창 → main(invoke): 바꾼 필드만 저장 */
  settingsUpdate: 'settings:update',
  /** main → 설정 창: 설정이 바뀜(어디서든) */
  settingsChanged: 'settings:changed',
  settingsHotkeyCheck: 'settings:hotkey-check',
  /** 설정 창 → main(send): 단축키 녹화 시작·끝(녹화 중에는 모든 단축키를 잠시 푼다) */
  settingsHotkeyRecord: 'settings:hotkey-record',
  settingsHotkeySet: 'settings:hotkey-set',
  /** 설정 창 → main(send): settings.json·로그 폴더를 기본 프로그램으로 */
  settingsOpenFile: 'settings:open-file',
  settingsOpenOnboarding: 'settings:open-onboarding',
  onboardingCandidates: 'onboarding:candidates',
  onboardingFinish: 'onboarding:finish',
  /** main → 온보딩: 따라 해 보기의 프롬프트가 실행됐다 */
  onboardingProgress: 'onboarding:progress',
  settingsDictionary: 'settings:dictionary',
  settingsDictionarySave: 'settings:dictionary-save',
  settingsDictionaryImport: 'settings:dictionary-import',
  settingsDictionaryExport: 'settings:dictionary-export',
  settingsTemplates: 'settings:templates',
  settingsTemplateSave: 'settings:template-save',
  settingsTemplateDelete: 'settings:template-delete',
  settingsTemplateImport: 'settings:template-import',
  settingsTemplateExport: 'settings:template-export',
  settingsReferences: 'settings:references',
  settingsReferenceGet: 'settings:reference-get',
  settingsReferenceSave: 'settings:reference-save',
  settingsReferenceDelete: 'settings:reference-delete',
  settingsGlossary: 'settings:glossary',
  settingsGlossarySave: 'settings:glossary-save',
  settingsGlossaryDelete: 'settings:glossary-delete',
  settingsGlossaryPack: 'settings:glossary-pack'
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
  /** 설정 창·온보딩(설계 문서 §14·§6). 설정 창이 아닌 창이 부르면 main이 거절한다 */
  settings: SettingsApi
}

/** 설정 창·온보딩이 쓰는 main 기능 */
export interface SettingsApi {
  get(): Promise<SettingsSnapshot | null>
  update(patch: SettingsPatch): Promise<SettingsUpdateResult>
  onChanged(cb: (s: SettingsSnapshot) => void): () => void
  hotkeyCheck(id: SettingsHotkeyId, acc: string): Promise<HotkeyCheck>
  hotkeyRecord(on: boolean): void
  hotkeySet(id: SettingsHotkeyId, acc: string): Promise<HotkeySetResult>
  openFile(which: 'settings' | 'logs'): void
  openOnboarding(): void
  onboardingCandidates(): Promise<HotkeyCandidate[]>
  finishOnboarding(): Promise<void>
  /** 따라 해 보기: 회의록 정리 프롬프트가 실행됐다 */
  onOnboardingProgress(cb: () => void): () => void
  /** 가명 사전(설계 문서 §8): 지금 항목과 읽지 못한 까닭 */
  dictionary(): Promise<{ terms: MaskTerm[]; errors: string[] }>
  dictionarySave(terms: MaskTerm[]): Promise<{ ok: true; count: number } | { ok: false; errors: string[] }>
  /** 파일을 골라 더한다(대화상자). 고르지 않았으면 canceled */
  dictionaryImport(): Promise<FileActionResult & { added?: number; skipped?: number }>
  /** 사내에서만 공유하라는 확인 뒤 파일로 저장(대화상자) */
  dictionaryExport(): Promise<FileActionResult>
  /** 프롬프트·상용구(설계 문서 §7): 전체 목록, 내 파일에 있는 id, 기본 템플릿 id, 내 파일을 읽을 때의 문제 */
  templates(): Promise<{ templates: Template[]; mine: string[]; builtinIds: string[]; errors: string[] }>
  templateSave(draft: TemplateDraft): Promise<{ ok: true; id: string } | { ok: false; errors: string[] }>
  /** 내 파일에서 지운다(기본 템플릿을 고친 것이면 기본값으로 돌아감) */
  templateDelete(id: string): Promise<{ ok: true } | { ok: false; reason: string }>
  /** 받은 템플릿 팩을 별도 파일로 더한다(대화상자) */
  templateImport(): Promise<FileActionResult & { added?: number; replaced?: number }>
  /** 내 템플릿을 팩 파일로(대화상자) */
  templateExport(): Promise<FileActionResult>
  /** 기준 예시 문서(설계 문서 §7): 템플릿이 쓰는 종류와 파일만 있는 종류 */
  references(): Promise<ReferenceKind[]>
  referenceGet(kind: string): Promise<string | null>
  referenceSave(kind: string, text: string): Promise<{ ok: true; warning?: string } | { ok: false; reason: string }>
  referenceDelete(kind: string): Promise<{ ok: true } | { ok: false; reason: string }>
  /** 용어 사전(설계 문서 §9): 전체 용어와 기본 용어 id */
  glossary(): Promise<{ entries: GlossaryEntry[]; builtinIds: string[] }>
  glossarySave(draft: WikiDraft, o: { id?: string; allowDuplicate: boolean }): Promise<WikiSaveResult>
  glossaryDelete(id: string): Promise<{ ok: true } | { ok: false; reason: 'builtin' | 'missing' | 'save-failed' }>
  /** 용어 팩 가져오기·내보내기(팔레트 명령과 같은 흐름, 결과는 알림으로) */
  glossaryPack(which: 'import' | 'export'): Promise<void>
}

/** 기준 예시 한 종류: 파일 글자 수(없으면 null)와 쓰는 템플릿 이름 */
export type ReferenceKind = { kind: string; length: number | null; usedBy: string[] }

/** 편집기가 보내는 템플릿(id가 없으면 새로 만든다) */
export type TemplateDraft = Omit<Template, 'scope' | 'id'> & { id?: string }

/** 대화상자를 거치는 파일 동작의 결과 */
export type FileActionResult = { ok: true } | { ok: false; errors: string[] } | { canceled: true }
