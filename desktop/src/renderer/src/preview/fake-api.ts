import type { BarViewState } from '../../../shared/bar/bar-items'
import type { FlyoutAction, FlyoutMessage } from '../../../shared/flyout/flyout-content'
import type { AppStatus, SureMateApi } from '../../../shared/ipc-channels'
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
}

const DEFAULT_FIXTURES: FakeFixtures = {
  status: { paletteHotkey: null, maskingMode: 'restore', aiTargetName: 'Claude' },
  items: [],
  barState: null,
  flyout: null
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
    flyoutAction: async (a) => (fx.flyout?.action ? fx.flyout.action(a) : false)
  }
}
