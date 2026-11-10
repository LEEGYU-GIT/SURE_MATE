import type { BarViewState } from '../../../shared/bar/bar-items'
import type { FlyoutAction, FlyoutMessage } from '../../../shared/flyout/flyout-content'
import { allAiTargets } from '../../../shared/ai-targets'
import type { AppStatus, SettingsApi, SureMateApi } from '../../../shared/ipc-channels'
import { applySettingsPatch, validateSettingsPatch } from '../../../shared/settings/settings-patch'
import type { HotkeyCandidate, SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import type { MaskTerm } from '../../../shared/masking/dictionary'
import type { Template } from '../../../shared/template/types'
import type { PaletteItem } from '../../../shared/types'

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
  /** 설정 창·온보딩이 받는 상태. 저장하면 진짜 검사·적용 규칙으로 이 값을 바꾼다 */
  settings: SettingsSnapshot | null
  hotkeyCandidates: HotkeyCandidate[]
  dictionary: MaskTerm[]
  templates: Template[]
}

const DEFAULT_FIXTURES: FakeFixtures = {
  status: { paletteHotkey: null, maskingMode: 'restore', aiTargetName: 'Claude' },
  items: [],
  barState: null,
  flyout: null,
  settings: null,
  hotkeyCandidates: [],
  dictionary: [],
  templates: []
}

/** 지정하지 않은 메서드는 빈 결과를 돌려주고 아무것도 하지 않는다. SureMateApi 전체 구현은 타입 검사가 강제한다. */
export function createFakeApi(f: Partial<FakeFixtures> = {}): SureMateApi {
  const fx: FakeFixtures = { ...DEFAULT_FIXTURES, ...f }
  return {
    hide: () => {},
    runItem: async () => {},
    listItems: async () => fx.items,
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
    onShown: () => () => {},
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
    settings: fakeSettingsApi(fx)
  }
}

/** 설정 창 미리 보기: 저장은 진짜 검사(validateSettingsPatch)·적용 규칙으로 메모리의 스냅숏만 바꾼다 */
function fakeSettingsApi(fx: FakeFixtures): SettingsApi {
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
    hotkeyCheck: async () => ({ level: 'ok' }),
    hotkeyRecord: () => {},
    hotkeySet: async (_id, acc) => ({ ok: true, acc }),
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
    templateDelete: async () => ({ ok: true })
  }
}
