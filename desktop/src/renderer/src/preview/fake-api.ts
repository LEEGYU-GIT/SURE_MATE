import type { BarViewState } from '../../../shared/bar/bar-items'
import type { FlyoutAction, FlyoutMessage } from '../../../shared/flyout/flyout-content'
import { allAiTargets } from '../../../shared/ai-targets'
import type { AppStatus, SettingsApi, ShownPayload, SureMateApi } from '../../../shared/ipc-channels'
import type { PetView } from '../../../shared/pet/pet-view'
import { applySettingsPatch, validateSettingsPatch } from '../../../shared/settings/settings-patch'
import type { HotkeyCandidate, SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import type { MaskTerm } from '../../../shared/masking/dictionary'
import type { GlossaryEntry } from '../../../shared/glossary/types'
import type { Template } from '../../../shared/template/types'
import type { PaletteItem } from '../../../shared/types'
import builtinIntents from '../../../../resources/intents.json'
import { parseIntentPack } from '../../../shared/natural/intent-pack'
import type { NaturalChangeResult, NaturalView } from '../../../shared/natural/natural-ipc'
import type { UsageRecord } from '../../../shared/natural/usage'
import { applyWorkspaceEdit } from '../../../shared/workspace/edit'
import { WORKSPACE_NOTES } from '../../../shared/workspace/messages'
import type { WorkspaceListView } from '../../../shared/workspace/workspace-ipc'

/**
 * 미리 보기의 펼침 창 연결(main의 펼침 창 컨트롤러 대신). 내용을 보내고, 화면이 알린 크기로 배치한 뒤 shown을 보낸다.
 * 장면이 만든다(scenes.tsx). action은 카드 단추(설명 복사·고정)를 눌러 볼 때 main 대신 답한다(없으면 false).
 */
export interface FakeFlyoutHost {
  onContent(cb: (m: FlyoutMessage) => void): () => void
  onShown(cb: (seq: number) => void): () => void
  ready(seq: number, width: number, height: number): void
  action?(a: FlyoutAction): Promise<boolean>
}

/** 장면마다 지정하는 가짜 데이터 */
export interface FakeFixtures {
  status: AppStatus
  items: PaletteItem[]
  /** 바 화면(`<Bar />`)이 getBarState로 받는 상태 */
  barState: BarViewState | null
  /** 펼침 창 화면(`<Flyout />`)의 내용·배치 */
  flyout: FakeFlyoutHost | null
  /** 펫 창 화면(`<Pet />`)이 getPetView로 받는 상태 */
  petView: PetView | null
  /** 설정 창·온보딩이 받는 상태. 저장하면 진짜 검사·적용 규칙으로 이 값을 바꾼다 */
  settings: SettingsSnapshot | null
  hotkeyCandidates: HotkeyCandidate[]
  dictionary: MaskTerm[]
  templates: Template[]
  glossary: GlossaryEntry[]
  /** 기억한 문장([키, 항목 id])과 사용 기록([항목 id, 기록]) */
  searchContext: { learned: [string, string][]; usage: [string, UsageRecord][] }
  /** 팔레트 화면(`<Palette />`)이 onShown을 등록한 직후 한 번 받는 표시 알림(시작 검색어 등). null이면 보내지 않는다 */
  shown: ShownPayload | null
  /** 설정 창 워크스페이스 탭이 받는 목록. 편집·단축키·지우기는 진짜 검사(applyWorkspaceEdit)로 이 값을 바꾼다 */
  workspaces: WorkspaceListView | null
  /** 설정 창 말하듯 입력 탭이 받는 보기. 지우기는 이 값을 바꾸고 듣는 화면에 알린다. null이면 읽지 못한 것처럼 */
  natural: NaturalView | null
}

const DEFAULT_FIXTURES: FakeFixtures = {
  status: { paletteHotkey: null, maskingMode: 'restore', aiTargetName: 'Claude' },
  items: [],
  barState: null,
  flyout: null,
  petView: null,
  settings: null,
  hotkeyCandidates: [],
  dictionary: [],
  templates: [],
  glossary: [],
  searchContext: { learned: [], usage: [] },
  shown: null,
  workspaces: null,
  natural: null
}

/** 지정하지 않은 메서드는 빈 결과를 돌려주고 아무것도 하지 않는다. SureMateApi 전체 구현은 타입 검사가 강제한다. */
export function createFakeApi(f: Partial<FakeFixtures> = {}): SureMateApi {
  const fx: FakeFixtures = { ...DEFAULT_FIXTURES, ...f }
  const ws = fakeWorkspaces(fx)
  const natural = fakeNatural(fx)
  return {
    hide: () => {},
    runItem: async () => {},
    listItems: async () => fx.items,
    getSearchContext: async () => ({ pack: parseIntentPack(builtinIntents).pack, learned: fx.searchContext.learned, usage: fx.searchContext.usage, now: Date.now() }),
    recordPick: () => {},
    previewPrompt: async () => ({
      text: '',
      truncated: false,
      inputLength: 0,
      warnings: [],
      notes: [],
      highlights: [],
      masking: { mode: fx.status.maskingMode, items: [] },
      maskRanges: []
    }),
    runPrompt: async () => ({ ok: true, message: '' }),
    cancelPrompt: () => {},
    getStatus: async () => fx.status,
    getWikiEntry: async () => null,
    copyWikiDefinition: async () => false,
    openWikiLink: async () => false,
    saveWikiEntry: async () => ({ ok: false, errors: [] }),
    // 실제 main처럼 등록이 끝난 뒤에 보낸다. 등록을 풀면(StrictMode의 다시 등록 포함) 보내지 않는다
    onShown: (cb) => {
      const shown = fx.shown
      if (!shown) return () => {}
      const timer = setTimeout(() => cb(shown), 0)
      return () => clearTimeout(timer)
    },
    saveImeLog: async () => '',
    getBarState: async () => fx.barState,
    onBarState: () => () => {},
    barAction: () => {},
    barHover: () => {},
    barPointer: () => {},
    barContextMenu: () => {},
    barDrag: () => {},
    // 실제 창처럼 처음 물을 때는 내용이 없고, 내용은 구독한 뒤 main(여기서는 장면)이 보낸다
    getFlyoutContent: async () => null,
    onFlyoutContent: (cb) => fx.flyout?.onContent(cb) ?? (() => {}),
    onFlyoutShown: (cb) => fx.flyout?.onShown(cb) ?? (() => {}),
    onFlyoutHidden: () => () => {},
    flyoutReady: (seq, width, height) => fx.flyout?.ready(seq, width, height),
    flyoutPointer: () => {},
    flyoutAction: async (a) => (fx.flyout?.action ? fx.flyout.action(a) : false),
    getPetView: async () => fx.petView,
    onPetView: () => () => {},
    petPress: () => {},
    petContextMenu: () => {},
    petBubbleClick: () => {},
    petBubbleRect: () => {},
    petMenu: () => {},
    petKey: () => {},
    settings: fakeSettingsApi(fx, ws),
    listWorkspaces: async () => ws.view(),
    onWorkspacesChanged: (cb) => ws.listen(cb),
    getWorkspace: async (id) => ws.view().items.find((i) => i.workspace.id === id) ?? null,
    editWorkspace: async (id, edit) => ws.edit(id, edit),
    // 미리 보기에는 창이 없으므로 창을 읽는 일(다시 저장·새로 저장·불러오기)은 Win32를 막은 것처럼 답한다
    recaptureWorkspace: async () => ({ ok: false, reason: 'native-unavailable', message: WORKSPACE_NOTES.nativeUnavailable }),
    runWorkspace: async () => ({ ok: false, reason: 'native-unavailable' }),
    saveWorkspaceNew: async () => ({ ok: false, reason: 'native-unavailable', message: WORKSPACE_NOTES.nativeUnavailable }),
    removeWorkspace: async (id) => ws.remove(id),
    saveWorkspaceAs: async () => ({ ok: false, reason: 'native-unavailable', message: '' }),
    naturalView: async () => natural.view(),
    onNaturalChanged: (cb) => natural.listen(cb),
    forgetPhrase: async (key) => natural.change((v) => ({ phrases: v.phrases.filter((p) => p.key !== key) })),
    forgetAllPhrases: async () => natural.change(() => ({ phrases: [] })),
    clearUsage: async () => natural.change(() => ({ usageCount: 0 })),
    // 미리 보기에는 파일이 없으므로 열 프로그램이 없어 폴더를 연 것처럼 답한다
    openIntentsFile: async () => ({ ok: true, opened: false })
  }
}

/** 미리 보기 말하듯 입력: 메모리의 보기를 바꾸고 rev를 올려 듣는 화면에 알린다(실제 main의 natural:changed처럼) */
function fakeNatural(fx: FakeFixtures): {
  view(): NaturalView | null
  listen(cb: (v: NaturalView) => void): () => void
  change(patch: (v: NaturalView) => Partial<Pick<NaturalView, 'phrases' | 'usageCount'>>): NaturalChangeResult
} {
  let state = fx.natural
  const listeners = new Set<(v: NaturalView) => void>()
  return {
    view: () => state,
    listen(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    change(patch) {
      if (!state) return { ok: false }
      const prev = state
      const next: NaturalView = { ...prev, ...patch(prev), rev: prev.rev + 1 }
      state = next
      for (const cb of listeners) cb(next)
      // 지운 수: 줄어든 문장 수 + 줄어든 사용 기록 수
      return { ok: true, count: prev.phrases.length - next.phrases.length + (prev.usageCount - next.usageCount), view: next }
    }
  }
}

/** 미리 보기 워크스페이스: 메모리의 목록을 진짜 편집 규칙으로 바꾸고 듣는 화면에 알린다(실제 main의 workspace:changed처럼) */
function fakeWorkspaces(fx: FakeFixtures): {
  view(): WorkspaceListView
  listen(cb: (v: WorkspaceListView) => void): () => void
  edit(id: string, edit: Parameters<SureMateApi['editWorkspace']>[1]): ReturnType<SureMateApi['editWorkspace']>
  remove(id: string): Promise<boolean>
  setHotkey(id: string, acc: string | null): void
} {
  let state: WorkspaceListView = fx.workspaces ?? { items: [], canControl: true }
  const listeners = new Set<(v: WorkspaceListView) => void>()
  const publish = (next: WorkspaceListView): void => {
    state = next
    for (const cb of listeners) cb(state)
  }
  return {
    view: () => state,
    listen(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async edit(id, edit) {
      const item = state.items.find((i) => i.workspace.id === id)
      if (!item) return { ok: false, errors: [WORKSPACE_NOTES.missing] }
      const r = applyWorkspaceEdit(
        item.workspace,
        edit,
        state.items.map((i) => i.workspace),
        new Date()
      )
      if (r.ok) publish({ ...state, items: state.items.map((i) => (i.workspace.id === id ? { ...i, workspace: r.workspace } : i)) })
      return r
    },
    async remove(id) {
      publish({ ...state, items: state.items.filter((i) => i.workspace.id !== id) })
      return true
    },
    setHotkey(id, acc) {
      publish({ ...state, items: state.items.map((i) => (i.workspace.id === id ? { ...i, workspace: { ...i.workspace, hotkey: acc }, hotkeyRegistered: acc !== null } : i)) })
    }
  }
}

/** 설정 창 미리 보기: 저장은 진짜 검사(validateSettingsPatch)·적용 규칙으로 메모리의 스냅숏만 바꾼다 */
function fakeSettingsApi(fx: FakeFixtures, ws: ReturnType<typeof fakeWorkspaces>): SettingsApi {
  let snap = fx.settings
  const listeners = new Set<(s: SettingsSnapshot) => void>()
  return {
    get: async () => snap,
    update: async (patch) => {
      if (!snap) return { ok: false, errors: ['미리 보기 설정 없음'] }
      const v = validateSettingsPatch(patch, snap.settings)
      if (!v.ok) return { ok: false, errors: v.errors }
      const settings = applySettingsPatch(snap.settings, v.patch)
      snap = { ...snap, settings, aiTargets: allAiTargets(settings.ai.custom) }
      for (const cb of listeners) cb(snap)
      return { ok: true, snapshot: snap }
    },
    onChanged: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    onShowTab: () => () => {},
    hotkeyCheck: async () => ({ level: 'ok' }),
    hotkeyRecord: () => {},
    // 바꾼 조합을 스냅숏에도 넣어 화면이 실제처럼 다시 그리게 한다(조종 단축키는 비울 수 있다). 워크스페이스 단축키는 목록에 넣는다
    hotkeySet: async (id, acc) => {
      if (id.startsWith('workspace:')) ws.setHotkey(id.slice('workspace:'.length), acc)
      else if (snap) {
        const settings = id === 'pet-control' ? { ...snap.settings, pet: { ...snap.settings.pet, controlHotkey: acc } } : snap.settings
        snap = { ...snap, settings, hotkeys: { ...snap.hotkeys, [id]: { acc, registered: acc !== null } } }
        for (const cb of listeners) cb(snap)
      }
      return { ok: true, acc }
    },
    openFile: () => {},
    openOnboarding: () => {},
    onboardingCandidates: async () => fx.hotkeyCandidates,
    finishOnboarding: async () => {},
    onOnboardingProgress: () => () => {},
    dictionary: async () => ({ terms: fx.dictionary, errors: [] }),
    dictionarySave: async (terms) => ({ ok: true, count: terms.length }),
    dictionaryImport: async () => ({ canceled: true }),
    dictionaryExport: async () => ({ canceled: true }),
    templates: async () => ({ templates: fx.templates, mine: fx.templates.filter((t) => t.scope === 'personal').map((t) => t.id), builtinIds: fx.templates.filter((t) => t.scope === 'builtin').map((t) => t.id), errors: [] }),
    templateSave: async (draft) => ({ ok: true, id: draft.id ?? 'my-preview' }),
    templateDelete: async () => ({ ok: true }),
    templateImport: async () => ({ canceled: true }),
    templateExport: async () => ({ canceled: true }),
    references: async () => [
      { kind: '회의록', length: 1240, usedBy: ['회의록 정리'] },
      { kind: '시험 항목', length: null, usedBy: ['요구사항 → 테스트 케이스'] }
    ],
    referenceGet: async () => null,
    referenceSave: async () => ({ ok: true }),
    referenceDelete: async () => ({ ok: true }),
    glossary: async () => ({ entries: fx.glossary, builtinIds: fx.glossary.filter((e) => e.source === 'builtin').map((e) => e.id) }),
    glossarySave: async () => ({ ok: false, errors: ['미리 보기에서는 저장하지 않아요'] }),
    glossaryDelete: async () => ({ ok: true }),
    glossaryPack: async () => {}
  }
}
