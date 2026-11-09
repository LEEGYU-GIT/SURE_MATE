import type { AppStatus, SureMateApi } from '../../../shared/ipc-channels'
import type { PaletteItem } from '../../../shared/types'

/** 장면마다 지정하는 가짜 데이터. 이후 작업이 barState·flyout 등을 추가한다. */
export interface FakeFixtures {
  status: AppStatus
  items: PaletteItem[]
}

const DEFAULT_FIXTURES: FakeFixtures = {
  status: { paletteHotkey: null, maskingMode: 'restore', aiTargetName: 'Claude' },
  items: []
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
    saveImeLog: async () => ''
  }
}
