import type { BarPressKind } from './bar/bar-ipc'
import type { BarViewState } from './bar/bar-items'
import type { FlyoutAction, FlyoutMessage } from './flyout/flyout-content'
import type { GlossaryEntry, WikiDraft, WikiSaveResult } from './glossary/types'
import type { MaskTerm } from './masking/dictionary'
import type { NaturalChangeResult, NaturalOpenResult, NaturalView, SearchContextPayload } from './natural/natural-ipc'
import type { Template } from './template/types'
import type { MaskItem } from './masking/types'
import type { PetKey, PetMenuAction, PetView } from './pet/pet-view'
import type { SettingsPatch } from './settings/settings-patch'
import type { SettingsTabId } from './settings/settings-route'
import type { HotkeyCandidate, HotkeyCheck, HotkeySetResult, SettingsHotkeyId, SettingsSnapshot, SettingsUpdateResult } from './settings/settings-snapshot'
import type { CaptureSkipReason, MaskingMode, PaletteItem, Rect } from './types'
import type { WorkspaceEdit } from './workspace/edit'
import type { WorkspaceEditResult, WorkspaceListView, WorkspaceRunResult, WorkspaceSaveResult, WorkspaceView } from './workspace/workspace-ipc'

/** 프롬프트에 넣을 글의 출처 */
export type PromptSource = 'selection' | 'clipboard' | 'input'

/** 첫 실행 안내의 따라 해 보기 진행(main → 온보딩): 회의록 정리 프롬프트를 실행했다, 이 워크스페이스를 불러왔다 */
export type OnboardingProgress = { kind: 'prompt' } | { kind: 'workspace'; id: string }

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
  /** 가명 처리 첫 안내(예시)를 아직 보지 않았다(설정 tips.maskingExampleSeen의 반대). 끔·직접 입력이면 화면이 숨긴다 */
  maskingTip: boolean
}

/** 가명 처리 첫 안내를 다 봤다고 정한 까닭: [알겠어요]로 닫음, 안내가 보이는 채로 프롬프트를 복사함 */
export type MaskingTipSeen = 'dismissed' | 'copied'
export const parseMaskingTipSeen = (v: unknown): MaskingTipSeen | null =>
  v === 'dismissed' || v === 'copied' ? v : null

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
  /** 팔레트 → main(invoke): 말하듯 입력 검색 문맥(단어 목록·기억한 문장·사용 기록) */
  paletteSearchContext: 'palette:search-context',
  /** 팔레트 → main(send): 항목을 골랐다(사용 기록, 기억하기) */
  palettePick: 'palette:pick',
  promptPreview: 'prompt:preview',
  promptRun: 'prompt:run',
  promptCancel: 'prompt:cancel',
  /** 팔레트 → main(send): 확인 화면의 가명 처리 첫 안내를 다 봤다(MaskingTipSeen). main이 설정에 남겨 다시 보이지 않는다 */
  maskingTipSeen: 'prompt:masking-tip-seen',
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
  petContextMenu: 'pet:context-menu',
  /** 펫 창 → main(send): 말풍선을 눌렀다(닫기) */
  petBubbleClick: 'pet:bubble-click',
  /** 펫 창 → main(send): 잰 말풍선 사각형(창 좌표, DIP). 말풍선이 사라지면 null */
  petBubbleRect: 'pet:bubble-rect',
  /** 펫 창 → main(send): 오른쪽 클릭 메뉴 행을 골랐다(PetMenuAction) */
  petMenu: 'pet:menu',
  /** 펫 창 → main(send): 조종 모드 키 누름·뗌(PetKey, down) */
  petKey: 'pet:key',
  /** 설정 창 → main(invoke): 지금 설정과 화면에 필요한 상태 */
  settingsGet: 'settings:get',
  /** 설정 창 → main(invoke): 바꾼 필드만 저장 */
  settingsUpdate: 'settings:update',
  /** main → 설정 창: 설정이 바뀜(어디서든) */
  settingsChanged: 'settings:changed',
  /** main → 설정 창: 열려 있는 설정 창에서 이 탭을 고른다(펫 메뉴 "펫 설정" 등, SettingsTabId). 워크스페이스 탭은 열 워크스페이스 id도(없으면 null) */
  settingsShowTab: 'settings:show-tab',
  settingsHotkeyCheck: 'settings:hotkey-check',
  /** 설정 창 → main(send): 단축키 녹화 시작·끝(녹화 중에는 모든 단축키를 잠시 푼다) */
  settingsHotkeyRecord: 'settings:hotkey-record',
  /** main → 설정 창: main이 스스로 녹화를 끝냈다(30초). 녹화 칸을 닫는다 */
  settingsHotkeyRecordEnded: 'settings:hotkey-record-ended',
  settingsHotkeySet: 'settings:hotkey-set',
  /** 설정 창 → main(send): settings.json·로그 폴더를 기본 프로그램으로 */
  settingsOpenFile: 'settings:open-file',
  settingsOpenOnboarding: 'settings:open-onboarding',
  /** 설정 창 → main(send): 말랑 메이트 탭 '미리 보기' — 이석 미리 알림을 지금 한 번 보인다(알림을 꺼 두었거나 Ttree가 없어도) */
  settingsAwayPreview: 'settings:away-preview',
  onboardingCandidates: 'onboarding:candidates',
  onboardingFinish: 'onboarding:finish',
  /** main → 온보딩: 따라 해 보기가 진행됐다(OnboardingProgress: 회의록 프롬프트 실행, 워크스페이스 불러오기) */
  onboardingProgress: 'onboarding:progress',
  /** 온보딩 → main: 워크스페이스 따라 해 보기의 '지금 배치 저장'(이름이 같으면 그 워크스페이스를 다시 저장, 알림 없이) */
  onboardingSaveWorkspace: 'onboarding:save-workspace',
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
  settingsGlossaryPack: 'settings:glossary-pack',
  /** 설정 창 → main(invoke): 워크스페이스 탭 목록(최근에 바꾼 순서)과 창을 저장·불러올 수 있는지 */
  workspaceList: 'workspace:list',
  /** main → 설정 창: 워크스페이스 목록이 바뀜(어디서든: 팔레트·바 저장, 편집, 단축키, 지우기) */
  workspaceChanged: 'workspace:changed',
  /** 설정 창 → main(invoke): 워크스페이스 하나와 지금 모니터 구성에서 저장한 배치인지 */
  workspaceGet: 'workspace:get',
  /** 설정 창 → main(invoke): 이름·별칭·창 규칙 편집 저장 */
  workspaceEdit: 'workspace:edit',
  /** 설정 창 → main(invoke): 지금 배치로 다시 저장 */
  workspaceRecapture: 'workspace:recapture',
  /** 설정 창 → main(invoke): 불러오기(결과 알림은 서비스가 띄운다) */
  workspaceRun: 'workspace:run',
  /** 설정 창 → main(invoke): 지금 배치를 새 워크스페이스로 저장(알림 없이 결과를 화면에) */
  workspaceSaveNew: 'workspace:save-new',
  /** 설정 창 → main(invoke): 지우기 */
  workspaceRemove: 'workspace:remove',
  workspaceSetKeepOnTop: 'workspace:set-keep-on-top',
  /** 팔레트 → main(invoke): `@이름` 줄 — 그 이름으로 지금 배치 저장(같은 이름이 있으면 다시 저장) */
  workspaceSaveAs: 'workspace:save-as',
  /** 설정 창 → main(invoke): 말하듯 입력 탭 보기(기억한 문장·사용 기록 수·단어 목록, 설계 §13·§14) */
  naturalView: 'natural:view',
  /** main → 설정 창: 기억한 문장·사용 기록이 바뀜(팔레트 선택·기억하기, 지우기) */
  naturalChanged: 'natural:changed',
  /** 설정 창 → main(invoke): 기억한 문장 하나 지우기(정규화한 문장 키) */
  naturalForget: 'natural:forget',
  /** 설정 창 → main(invoke): 기억한 문장 모두 지우기 */
  naturalForgetAll: 'natural:forget-all',
  /** 설정 창 → main(invoke): 사용 기록 지우기 */
  naturalClearUsage: 'natural:clear-usage',
  /** 설정 창 → main(invoke): 단어 목록 파일 열기(팔레트 명령 cmd.open-intents와 같은 흐름) */
  naturalOpenIntents: 'natural:open-intents'
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
  /** 말하듯 입력 검색 문맥(단어 목록·기억한 문장·사용 기록·지금 시각) */
  getSearchContext(): Promise<SearchContextPayload>
  /** 항목을 골랐다고 알린다. remember이면 query의 문장을 이 항목에 연결해 기억한다 */
  recordPick(p: { id: string; remember: boolean; query?: string }): void
  /** 확인 화면 미리 보기(가명 처리는 M3에서 여기에 들어간다) */
  previewPrompt(req: PromptRequest): Promise<PromptPreview>
  /** 복사하고 AI 대상을 연다 */
  runPrompt(req: PromptRequest): Promise<PromptRunResult>
  /** 확인 화면을 벗어날 때 세션을 버린다 */
  cancelPrompt(): void
  /** 확인 화면의 가명 처리 첫 안내를 다 봤다(다시 보이지 않게 main이 설정에 남긴다) */
  maskingTipSeen(reason: MaskingTipSeen): void
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
  /** 바 항목을 왼쪽 클릭했다. how는 실행한 방식(로그용, BarPressKind) */
  barAction(id: string, how: BarPressKind): void
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
  /** 말풍선을 눌렀다: main이 닫고 반응을 끝낸다 */
  petBubbleClick(): void
  /** 그린 말풍선 사각형(창 좌표, DIP)을 클릭 판정에 알린다. 사라지면 null */
  petBubbleRect(r: Rect | null): void
  /** 오른쪽 클릭 메뉴 행을 골랐다. main이 메뉴를 닫고 처리한다 */
  petMenu(a: PetMenuAction): void
  /** 조종 모드 키 누름(true)·뗌(false). 조종 중이 아니면 main이 무시한다 */
  petKey(k: PetKey, down: boolean): void
  /** 설정 창·온보딩(설계 문서 §14·§6). 설정 창이 아닌 창이 부르면 main이 거절한다 */
  settings: SettingsApi
  /** 설정 창 워크스페이스 탭(설계 §11): 목록과 창을 저장·불러올 수 있는지. 설정 창이 아닌 창이 부르면 빈 목록 */
  listWorkspaces(): Promise<WorkspaceListView>
  /** 워크스페이스 목록이 바뀌면(어디서든) 새 목록. 돌려받은 함수로 그만 듣는다 */
  onWorkspacesChanged(cb: (v: WorkspaceListView) => void): () => void
  /** 워크스페이스 하나(없으면 null). 설정 창이 아닌 창이 부르면 null */
  getWorkspace(id: string): Promise<WorkspaceView | null>
  /** 이름·별칭·창 규칙 편집을 저장한다. 오류는 화면에 보일 문구 */
  editWorkspace(id: string, edit: WorkspaceEdit): Promise<WorkspaceEditResult>
  /** 지금 배치로 다시 저장(이름·별칭·단축키는 그대로). 결과는 알리지 않고 돌려준다 */
  recaptureWorkspace(id: string): Promise<WorkspaceSaveResult>
  /** 그 워크스페이스를 불러온다(다른 모니터 구성이면 먼저 묻는다). 결과 알림은 main이 띄우고, 결과도 돌려준다 */
  runWorkspace(id: string): Promise<WorkspaceRunResult>
  /** 지금 배치를 새 워크스페이스로 저장('배치 N'). 결과는 알리지 않고 돌려준다 */
  saveWorkspaceNew(): Promise<WorkspaceSaveResult>
  removeWorkspace(id: string): Promise<boolean>
  /** 화면 감추기(기본 워크스페이스)의 '감춘 동안 업무 창을 항상 위에 두기'. 저장했으면 true */
  setWorkspaceKeepOnTop(id: string, on: boolean): Promise<boolean>
  /** 팔레트 `@이름` 줄: 그 이름으로 지금 배치 저장(같은 이름·별칭이 있으면 다시 저장). 성공하면 main이 팔레트를 숨긴다 */
  saveWorkspaceAs(name: string): Promise<WorkspaceSaveResult>
  /** 설정 창 말하듯 입력 탭(설계 §13·§14): 기억한 문장·사용 기록 수·단어 목록. 설정 창이 아닌 창이 부르거나 읽지 못하면 null */
  naturalView(): Promise<NaturalView | null>
  /** 기억한 문장·사용 기록이 바뀌면(어디서든) 새 보기. 돌려받은 함수로 그만 듣는다 */
  onNaturalChanged(cb: (v: NaturalView) => void): () => void
  /** 기억한 문장 하나를 지운다(화면에 보인 문장 키 그대로). 지운 수와 새 보기를 돌려준다 */
  forgetPhrase(key: string): Promise<NaturalChangeResult>
  /** 기억한 문장을 모두 지운다 */
  forgetAllPhrases(): Promise<NaturalChangeResult>
  /** 사용 기록(팔레트 빈 화면의 최근 항목·동점 순서)을 지운다 */
  clearUsage(): Promise<NaturalChangeResult>
  /** 단어 목록 파일을 연다(없으면 기본 목록으로 만든다). 열 프로그램이 없으면 폴더를 열고 opened false */
  openIntentsFile(): Promise<NaturalOpenResult>
}

/** 설정 창·온보딩이 쓰는 main 기능 */
export interface SettingsApi {
  get(): Promise<SettingsSnapshot | null>
  update(patch: SettingsPatch): Promise<SettingsUpdateResult>
  onChanged(cb: (s: SettingsSnapshot) => void): () => void
  /** main이 열린 설정 창에서 이 탭을 고르라고 알린다(창을 다시 읽지 않는다). ws는 워크스페이스 탭에서 열 워크스페이스(없으면 null) */
  onShowTab(cb: (tab: SettingsTabId, ws: string | null) => void): () => void
  hotkeyCheck(id: SettingsHotkeyId, acc: string): Promise<HotkeyCheck>
  hotkeyRecord(on: boolean): void
  /** main이 스스로 녹화를 끝냈다(30초가 지나 단축키를 되살림). 녹화 칸을 닫는다. 돌려받은 함수로 그만 듣는다 */
  onHotkeyRecordEnded(cb: () => void): () => void
  /** acc null은 단축키 비우기(조종 단축키만, 나머지는 main이 거절) */
  hotkeySet(id: SettingsHotkeyId, acc: string | null): Promise<HotkeySetResult>
  openFile(which: 'settings' | 'logs'): void
  openOnboarding(): void
  /** 이석 미리 알림 미리 보기: main이 지금 한 번 알린다(말랑 메이트 말풍선, 보일 수 없으면 Windows 알림). 꺼 두었거나 Ttree가 없어도 보인다 */
  awayPreview(): void
  onboardingCandidates(): Promise<HotkeyCandidate[]>
  finishOnboarding(): Promise<void>
  /** 따라 해 보기가 진행됐다(회의록 정리 프롬프트 실행, 워크스페이스 불러오기). 돌려받은 함수로 그만 듣는다 */
  onOnboardingProgress(cb: (p: OnboardingProgress) => void): () => void
  /** 워크스페이스 따라 해 보기: 지금 배치를 이 이름으로 저장한다(같은 이름이 있으면 그것을 다시 저장, 알림 없이) */
  onboardingSaveWorkspace(name: string): Promise<WorkspaceSaveResult>
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
