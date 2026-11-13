import { useEffect, useState } from 'react'
import builtinGlossary from '../../../../resources/glossary.json'
import builtinIntents from '../../../../resources/intents.json'
import builtinPrompts from '../../../../resources/prompts.json'
import { cardMaxHeight, edgeCardRect, flyoutCardRect, flyoutWindowRect } from '../../../main/flyout/flyout-placement'
import { buildBarItems, type BarViewState } from '../../../shared/bar/bar-items'
import { barRect, barSize, DEFAULT_BAR_RATIO, handleRect, itemOffsets } from '../../../shared/bar/bar-layout'
import type { BarEdge } from '../../../shared/bar/bar-settings'
import type { FlyoutContent, FlyoutMessage, FlyoutPad, WikiCardView } from '../../../shared/flyout/flyout-content'
import { workspaceMenuRowsThatFit } from '../../../shared/flyout/workspace-menu-fit'
import { parseGlossaryPack } from '../../../shared/glossary/pack'
import type { GlossaryEntry } from '../../../shared/glossary/types'
import { buildGlossaryIndex, toCardEntry, wikiCardView } from '../../../shared/glossary/wiki-lookup'
import type { AppEvent } from '../../../shared/app-events'
import { CAPTURE_NOTES } from '../../../shared/labels'
import type { MaskCategory } from '../../../shared/masking/types'
import { PET_CONTROL_GUIDE, petMenuRows } from '../../../shared/pet/pet-copy'
import { bubbleHop, bubbleSlot, menuSlot, petBox, petWindowRect } from '../../../shared/pet/pet-frame'
import { reactionFor } from '../../../shared/pet/pet-reactions'
import type { PetSize } from '../../../shared/pet/pet-settings'
import type { PetFace, PetLook, PetPose, PetView } from '../../../shared/pet/pet-view'
import { petWorld, type PetWorld } from '../../../shared/pet/pet-world'
import { parseIntentPack } from '../../../shared/natural/intent-pack'
import type { NaturalView } from '../../../shared/natural/natural-ipc'
import { buildNaturalView, type IntentState, type PhraseEntry } from '../../../shared/natural/natural-view'
import type { UsageRecord } from '../../../shared/natural/usage'
import { parseTemplatePack } from '../../../shared/template/pack'
import type { MaskingMode, MonitorInfo, PaletteItem, Rect } from '../../../shared/types'
import { Bar, BarView } from '../bar/Bar'
import { Flyout } from '../flyout/Flyout'
import { Palette } from '../palette/Palette'
import { StatusBar } from '../palette/StatusBar'
import { Pet } from '../pet/Pet'
import { PetSprite } from '../pet/PetSprite'
import { Onboarding } from '../onboarding/Onboarding'
import type { OnboardingState } from '../onboarding/onboarding-state'
import { TRY_MEMO } from '../onboarding/try-guide'
import { TryScreen } from '../onboarding/TryScreen'
import type { PromptPreview } from '../../../shared/ipc-channels'
import type { MaskTerm } from '../../../shared/masking/dictionary'
import { SettingsApp } from '../settings/SettingsApp'
import type { SettingsTabId } from '../settings/tabs'
import { allAiTargets } from '../../../shared/ai-targets'
import { DEFAULT_SETTINGS } from '../../../shared/settings/settings'
import type { SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import type { Template } from '../../../shared/template/types'
import { monitorFingerprint, monitorKey, toSavedMonitor } from '../../../shared/workspace/monitors'
import { L, P } from '../../../shared/workspace/test-monitors'
import type { RatioRect, WindowRule, Workspace } from '../../../shared/workspace/types'
import type { WorkspaceListView } from '../../../shared/workspace/workspace-ipc'
import { Desktop } from './Desktop'
import type { FakeFixtures, FakeFlyoutHost } from './fake-api'

export interface Scene {
  id: string
  title: string
  fixtures: Partial<FakeFixtures>
  render(): React.JSX.Element
}

/** Desktop(640×600)에서 아래 26px 작업 표시줄을 뺀 작업 영역(DIP) */
const WORK_AREA: Rect = { x: 0, y: 0, width: 640, height: 574 }

/** 기본 팩(resources/prompts.json)의 프롬프트 이름 */
const TEMPLATES = [
  { id: 'meeting-notes', name: '회의록 정리', kind: 'prompt' },
  { id: 'req-to-testcase', name: '요구사항 → 테스트 케이스', kind: 'prompt' },
  { id: 'static-analysis', name: '정적분석 위반 분석·소명 초안', kind: 'prompt' },
  { id: 'weekly-report', name: '주간보고 초안', kind: 'prompt' },
  { id: 'polish', name: '문장 다듬기', kind: 'prompt' }
] as const

const DEFAULT_PINNED = ['meeting-notes', 'req-to-testcase', 'static-analysis']
const FIVE_PINNED = [...DEFAULT_PINNED, 'weekly-report', 'polish']

type BarOptions = Partial<Pick<BarViewState, 'shape' | 'edge' | 'opacity' | 'collapsed' | 'busyItem'>> & {
  masking?: MaskingMode
  petVisible?: boolean
  pinned?: string[]
  paletteHotkey?: string
}

function barState(o: BarOptions = {}): BarViewState {
  return {
    shape: o.shape ?? 'edge',
    edge: o.edge ?? 'right',
    items: buildBarItems({
      pinned: o.pinned ?? DEFAULT_PINNED,
      templates: [...TEMPLATES],
      maskingMode: o.masking ?? 'restore',
      petVisible: o.petVisible ?? true,
      paletteHotkey: o.paletteHotkey ?? 'Alt+`'
    }),
    opacity: o.opacity ?? 1,
    collapsed: o.collapsed ?? false,
    busyItem: o.busyItem ?? null
  }
}

/**
 * 바 창 하나를 main이 놓는 자리(barRect, 접혔으면 handleRect)에 그린다. 창 밖은 잘린다.
 * fromApi면 실제 경로처럼 <Bar />가 가짜 window.sureMate.getBarState()로 상태를 받는다(장면의 fixtures.barState).
 */
function BarWindow({ state, fromApi = false }: { state: BarViewState; fromApi?: boolean }): React.JSX.Element {
  const bar = barRect({ workArea: WORK_AREA, shape: state.shape, edge: state.edge, size: barSize(state.items, state.shape), ratio: DEFAULT_BAR_RATIO })
  const r = state.collapsed ? handleRect(bar, state.edge, WORK_AREA) : bar
  return (
    <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.width, height: r.height, overflow: 'hidden' }}>
      {fromApi ? <Bar /> : <BarView state={state} />}
    </div>
  )
}

/** 시안의 앱 창(흰 문서). side: 바 반대쪽 위에 작은 창, under: 바 밑까지 덮는 큰 창 */
function AppWindow({ side, under = false }: { side: 'left' | 'right'; under?: boolean }): React.JSX.Element {
  const box: React.CSSProperties = under
    ? { top: 0, bottom: 0, width: 320, [side]: 0, borderRadius: 0 }
    : { top: 24, height: 300, width: 360, [side]: 24, borderRadius: 6, boxShadow: '0 10px 24px rgba(10, 12, 30, 0.4)' }
  return <div style={{ position: 'absolute', background: '#F7F8FA', ...box }} />
}

/** 작업 영역 전체를 덮는 무대. 바는 이 안에 절대 위치로 놓인다. */
function Stage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ position: 'relative', width: WORK_AREA.width, height: WORK_AREA.height }}>{children}</div>
}

/** 한 모양만: fixtures.barState를 <Bar />로 그린다 */
function single(id: string, title: string, o: BarOptions): Scene {
  const state = barState(o)
  return {
    id,
    title,
    fixtures: { barState: state },
    render: () => (
      <Desktop edge={state.edge}>
        <Stage>
          <AppWindow side={state.edge === 'right' ? 'left' : 'right'} />
          <BarWindow state={state} fromApi />
        </Stage>
      </Desktop>
    )
  }
}

/**
 * 두 모양을 한 화면에: 오른쪽 가장자리 띠(fixtures, <Bar />)와 왼쪽 떠 있는 캡슐(<BarView />).
 * 같은 상태를 두 크기(칸 40·36)에서 함께 확인한다.
 */
function pair(id: string, title: string, o: BarOptions, backdrop?: React.ReactNode): Scene {
  const edge = barState({ ...o, shape: 'edge', edge: 'right' })
  const capsule = barState({ ...o, shape: 'capsule', edge: 'left' })
  return {
    id,
    title,
    fixtures: { barState: edge },
    render: () => (
      <Desktop edge="right">
        <Stage>
          {backdrop}
          <BarWindow state={edge} fromApi />
          <BarWindow state={capsule} />
        </Stage>
      </Desktop>
    )
  }
}

/**
 * 펼침 창의 기준: 바 항목(이름표·메뉴·위키 카드는 용어 사전 항목), 바 창 안에서 오른쪽 클릭한 세로 위치(바 메뉴),
 * 또는 바를 끈 화면의 바 쪽 가장자리(위키 카드)
 */
type FlyoutAnchor = { itemId: string } | { clickY: number } | { barOff: BarEdge }
type Placed = { window: Rect; pad: FlyoutPad }

const ZERO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 }
const samePad = (a: FlyoutPad, b: FlyoutPad): boolean => a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/** 바 창 사각형(main의 barRect와 같은 자리) */
const barWindowRect = (s: BarViewState): Rect =>
  barRect({ workArea: WORK_AREA, shape: s.shape, edge: s.edge, size: barSize(s.items, s.shape), ratio: DEFAULT_BAR_RATIO })

/**
 * 펼침 창 배치: main과 같은 flyoutCardRect(바 안쪽 8 DIP)·edgeCardRect(바 끔: 가장자리 위쪽)·
 * flyoutWindowRect(그림자 여백, 작업 영역 안)
 */
function placeFlyout(bar: BarViewState | null, anchor: FlyoutAnchor, content: FlyoutContent, size: { width: number; height: number }): Placed {
  if ('barOff' in anchor) return flyoutWindowRect(edgeCardRect({ size, workArea: WORK_AREA, edge: anchor.barOff }), anchor.barOff, WORK_AREA)
  if (!bar) throw new Error('바 없이 바 기준으로 놓을 수 없음')
  const r = barWindowRect(bar)
  let at: Rect
  if ('itemId' in anchor) {
    const o = itemOffsets(bar.items, bar.shape).find((x) => x.id === anchor.itemId)
    if (!o) throw new Error(`바 항목 없음: ${anchor.itemId}`)
    at = { x: r.x, y: r.y + o.top, width: r.width, height: o.height }
  } else {
    at = { x: r.x, y: r.y + anchor.clickY, width: r.width, height: 0 }
  }
  const card = flyoutCardRect({ size, anchor: at, bar: r, edge: bar.edge, workArea: WORK_AREA, align: content.kind === 'label' ? 'center' : 'top' })
  return flyoutWindowRect(card, bar.edge, WORK_AREA)
}

/**
 * 미리 보기용 펼침 창 컨트롤러. main의 표시 순서를 따른다:
 * 내용 보냄 → 화면이 그린 크기를 알림(ready) → 배치(여백이 줄면 같은 seq로 여백만 다시 보냄) → 창을 그 자리에 → shown.
 * main처럼 지금 seq로 다시 알린 크기(카드 안에서 바뀐 크기)에도 창을 다시 놓고, 카드의 [설명 복사]·[고정]에 답한다.
 */
function createFlyoutDriver(bar: BarViewState | null, anchor: FlyoutAnchor, content: FlyoutContent) {
  const edge: BarEdge = 'barOff' in anchor ? anchor.barOff : (bar?.edge ?? 'right')
  let message: FlyoutMessage = { seq: 1, content, pad: flyoutWindowRect(ZERO_RECT, edge).pad, edge }
  let placed: Placed | null = null
  const contentCbs = new Set<(m: FlyoutMessage) => void>()
  const shownCbs = new Set<(seq: number) => void>()
  const placedCbs = new Set<(p: Placed) => void>()
  const send = (m: FlyoutMessage): void => {
    message = m
    for (const cb of contentCbs) cb(m)
  }
  const host: FakeFlyoutHost = {
    onContent(cb) {
      contentCbs.add(cb)
      setTimeout(() => {
        if (contentCbs.has(cb)) cb(message)
      }, 0)
      return () => contentCbs.delete(cb)
    },
    onShown(cb) {
      shownCbs.add(cb)
      return () => shownCbs.delete(cb)
    },
    ready(seq, width, height) {
      if (seq !== message.seq) return
      const p = placeFlyout(bar, anchor, message.content, { width, height })
      if (placed && sameRect(placed.window, p.window) && samePad(placed.pad, p.pad)) return
      placed = p
      if (!samePad(p.pad, message.pad)) send({ ...message, pad: p.pad })
      for (const cb of placedCbs) cb(p)
    },
    async action(a) {
      const c = message.content
      if (c.kind !== 'wiki-card') return false
      if (a.type === 'wiki-copy') return true
      if (a.type !== 'wiki-pin') return false
      // main의 pin처럼 고정만 바꾼 새 seq(카드는 열린 채 그대로)
      send({ ...message, seq: message.seq + 1, content: { ...c, pinned: a.pinned } })
      return true
    }
  }
  return {
    host,
    onPlaced(cb: (p: Placed) => void): () => void {
      placedCbs.add(cb)
      if (placed) cb(placed)
      return () => placedCbs.delete(cb)
    },
    shown(): void {
      for (const cb of shownCbs) cb(message.seq)
    }
  }
}

/**
 * 펼침 창 장면: 바와 그 옆 펼침 창(투명 창 사각형 밖은 잘린다 — 그림자가 창 안에 들어오는지 확인).
 * bar가 null이면 바를 끈 화면(edge는 카드를 띄울 가장자리)
 */
function FlyoutStage({ bar, edge, driver }: { bar: BarViewState | null; edge: BarEdge; driver: ReturnType<typeof createFlyoutDriver> }): React.JSX.Element {
  const [placed, setPlaced] = useState<Placed | null>(null)
  useEffect(() => driver.onPlaced(setPlaced), [driver])
  // 창을 자리에 놓은 뒤 shown(main의 showInactive → shown 순서). 다시 놓을 때의 shown은 화면이 무시한다
  useEffect(() => {
    if (placed) driver.shown()
  }, [placed, driver])
  const win = placed?.window ?? ZERO_RECT
  return (
    <Desktop edge={edge}>
      <Stage>
        <AppWindow side={edge === 'right' ? 'left' : 'right'} />
        {bar ? <BarWindow state={bar} /> : null}
        <div
          data-flyout-window=""
          style={{ position: 'absolute', left: win.x, top: win.y, width: win.width, height: win.height, overflow: 'hidden', visibility: placed ? 'visible' : 'hidden' }}
        >
          <Flyout />
        </div>
      </Stage>
    </Desktop>
  )
}

/** 워크스페이스 메뉴 장면 내용(가상 이름) */
const WS_MENU: Extract<FlyoutContent, { kind: 'workspace-menu' }> = {
  kind: 'workspace-menu',
  workspaces: [
    { id: 'ws-qa', name: 'QA 모드', windows: 3, otherConfig: false },
    { id: 'ws-review', name: '가상자동차 요구사항 검토', windows: 4, otherConfig: false },
    { id: 'ws-dock', name: '외부 모니터 발표', windows: 2, otherConfig: true }
  ],
  canSave: true,
  more: 0
}
/** 최근 8개(긴 이름 하나, 다른 구성 하나). 그 밖에 3개가 더 있다 */
const WS_MENU_MANY: Extract<FlyoutContent, { kind: 'workspace-menu' }>['workspaces'] = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `ws-${i}`, name: ['QA 모드', '회의', '코드 리뷰', '시험 결과 정리', '보고서 작성', '시뮬레이터 점검'][i], windows: 2 + (i % 3), otherConfig: false })),
  { id: 'ws-long', name: 'XY방산 HIL 벤치 시험 결과 비교와 보고서 초안 작성', windows: 5, otherConfig: false },
  { id: 'ws-dock', name: '외부 모니터 발표', windows: 2, otherConfig: true }
]

/** main(workspaceMenuContent)처럼 장면 작업 영역에서 카드 높이에 들어가는 행만 보이고 나머지는 '외 N개'로 센다 */
function fitWorkspaceMenu(canSave: boolean, beyond: number): Extract<FlyoutContent, { kind: 'workspace-menu' }> {
  const shown = workspaceMenuRowsThatFit({ maxHeight: cardMaxHeight(WORK_AREA), canSave, max: WS_MENU_MANY.length })
  return { kind: 'workspace-menu', workspaces: WS_MENU_MANY.slice(0, shown), canSave, more: WS_MENU_MANY.length - shown + beyond }
}
const WS_MENU_MORE = fitWorkspaceMenu(true, 3)
const WS_MENU_MORE_BLOCKED = fitWorkspaceMenu(false, 3)

function flyoutScene(id: string, title: string, bar: BarViewState | null, anchor: FlyoutAnchor, content: FlyoutContent): Scene {
  const driver = createFlyoutDriver(bar, anchor, content)
  const edge: BarEdge = 'barOff' in anchor ? anchor.barOff : (bar?.edge ?? 'right')
  return { id, title, fixtures: { flyout: driver.host }, render: () => <FlyoutStage bar={bar} edge={edge} driver={driver} /> }
}

// ── 위키 카드 장면: 기본 용어 팩(resources/glossary.json)을 앱과 같은 찾기 규칙(wikiCardView)으로 ──────────────

const PACK = parseGlossaryPack(builtinGlossary, 'builtin').entries
const PACK_INDEX = buildGlossaryIndex(PACK)
const packView = (text: string): WikiCardView => wikiCardView(text, 'selection', PACK, PACK_INDEX)
const packEntry = (id: string): GlossaryEntry => {
  const e = PACK.find((x) => x.id === id)
  if (!e) throw new Error(`기본 팩에 없는 용어: ${id}`)
  return e
}
/** 장면마다 카드 하나(카드 번호 1). 미리 보기의 [고정]은 main처럼 같은 번호로 고정만 바꾼다 */
const card = (view: WikiCardView, pinned = false): FlyoutContent => ({ kind: 'wiki-card', view, pinned, width: 360, cardId: 1 })

/** 회의 메모 한 줄(가상): 정적분석·MC/DC·커버리지·SIL(두 뜻)·ASIL·MISRA C·위반 소명 */
const MEETING_NOTE = '정적분석 결과에서 MC/DC 커버리지가 부족했고 SIL 2 요구사항과 ASIL B 기준, MISRA C 위반 소명이 필요합니다'

/** 사용자가 추가한 가상의 팀 용어: 설명이 길어 카드 안에서 스크롤된다(최대 높이 560) */
const RACK: GlossaryEntry = {
  id: 'u-hil-rack',
  term: 'HIL 랙',
  aliases: ['시험 랙', 'XY방산 HIL 벤치'],
  definition: [
    '가상자동차 제어기를 실제 차량 대신 실시간 시뮬레이터에 연결해 시험하는 장비 묶음이에요. 랙 하나에 시뮬레이터, 신호 변환 보드, 전원 공급기, 고장 주입 장치가 들어 있어요.',
    '',
    '시험 전에 할 일',
    '1. 시험 계획서의 랙 번호와 소프트웨어 버전이 맞는지 확인해요.',
    '2. 고장 주입 채널이 모두 꺼져 있는지 보고, 전원은 시험 담당자가 켜요.',
    '3. 측정 로그는 공용 폴더의 날짜 폴더에 저장해요.',
    '',
    '시험이 끝나면 고장 주입 채널을 끄고 랙 예약표에 사용 시간과 특이 사항을 적어요. 다른 팀이 바로 이어 쓰는 일이 많으니 케이블 연결을 시험 전 상태로 되돌려 주세요.',
    '',
    'XY방산 과제의 랙은 보안 구역에 있어 출입 기록을 남겨야 하고, 외부 저장 장치를 쓸 수 없어요. 측정 로그를 밖으로 옮길 때는 보안 담당자에게 반출 신청을 해요.'
  ].join('\n'),
  example: '랙 3번은 매주 화요일 오전에 XY방산 통합 시험으로 예약돼 있어요.',
  links: [],
  tags: ['시험 장비'],
  source: 'user',
  updatedAt: '2026-11-09T00:00:00.000Z',
  version: 2
}
const RACK_VIEW: WikiCardView = { kind: 'best', source: 'selection', best: toCardEntry(RACK), others: [toCardEntry(packEntry('hils')), toCardEntry(packEntry('sil-software'))] }


const EDGE_RIGHT = barState({ paletteHotkey: 'Ctrl+Alt+Space' })
const EDGE_RIGHT_OFF = barState({ masking: 'off', paletteHotkey: 'Ctrl+Alt+Space' })
const CAPSULE_LEFT = barState({ shape: 'capsule', edge: 'left', paletteHotkey: 'Ctrl+Alt+Space' })
const labelOf = (s: BarViewState, itemId: string): string => {
  const item = s.items.find((i) => i.id === itemId)
  return item && 'label' in item ? item.label : itemId
}

const CARD_SCENES: Scene[] = [
  flyoutScene('card-best', '위키 카드: 가장 맞는 항목(MC/DC, 사용 예)과 다른 뜻·비슷한 용어 2개', EDGE_RIGHT, { itemId: 'glossary' }, card(packView('MC/DC'))),
  flyoutScene('card-found', '위키 카드: 긴 글에 나온 용어 목록(처음 나온 순서, SIL은 두 뜻)', EDGE_RIGHT, { itemId: 'glossary' }, card(packView(MEETING_NOTE))),
  flyoutScene('card-none', '위키 카드: 짧은 글에 맞는 용어 없음, 팔레트에서 찾기', EDGE_RIGHT, { itemId: 'glossary' }, card(packView('XY방산 시험 규격'))),
  flyoutScene(
    'card-note',
    '위키 카드: 터미널이라 가져오지 않음, 클립보드 글로 찾기',
    EDGE_RIGHT,
    { itemId: 'glossary' },
    card({ kind: 'note', reason: 'terminal', message: CAPTURE_NOTES.terminal, canUseClipboard: true })
  ),
  flyoutScene('card-pinned', '위키 카드: 고정, 내 용어의 긴 설명이 카드 안에서 스크롤(최대 높이 560)', EDGE_RIGHT, { itemId: 'glossary' }, card(RACK_VIEW, true)),
  flyoutScene('card-edge', '위키 카드: 바 끔, 화면 가장자리 위쪽(같은 이름의 두 뜻 SIL)', null, { barOff: 'right' }, card(packView('SIL'))),
  flyoutScene(
    'card-note-empty',
    '위키 카드: 선택한 글도 클립보드 글도 없음(다음에 할 일 안내)',
    EDGE_RIGHT,
    { itemId: 'glossary' },
    card({ kind: 'note', reason: 'nothing-selected', message: CAPTURE_NOTES['nothing-selected'], canUseClipboard: false })
  ),
  flyoutScene('card-none-long', '위키 카드: 긴 글에 나온 용어 없음', EDGE_RIGHT, { itemId: 'glossary' }, card(packView('오늘 오후에 다음 주 일정과 담당자를 정했습니다'))),
  flyoutScene(
    'card-found-long',
    '위키 카드: 용어가 20개를 넘는 글(목록이 카드 안에서 스크롤, 맨 끝에 나머지 수)',
    EDGE_RIGHT,
    { itemId: 'glossary' },
    card(packView(PACK.slice(0, 26).map((e) => e.term).join(', ')))
  )
]

// ── 말랑 메이트 장면: 바는 barRect, 펫 창은 main과 같은 계산(petWorld·petBox·petWindowRect)으로 놓는다 ──────────

/** 미리 보기 모니터(Desktop 640×600, 작업 영역은 작업 표시줄 위 574까지) */
const MONITOR: MonitorInfo = { id: 'preview', bounds: { x: 0, y: 0, width: 640, height: 600 }, workArea: WORK_AREA, scaleFactor: 1, isPrimary: true, isInternal: true }

/** 펫 발 자리: 바닥(발 x), 바 꼭대기 가운데, 바 옆면(아래 0 ~ 꼭대기 1), 들림(커서가 격자 (32, 4)) */
type PetSpot = { at: 'floor'; x: number } | { at: 'ledge' } | { at: 'side'; t: number } | { at: 'cursor'; x: number; y: number }

const petLook = (o: Partial<PetLook> = {}): PetLook => ({ pose: 'stand', face: 'normal', props: [], facing: 'right', cue: null, cueSeq: 0, ...o })

function petFoot(world: PetWorld, spot: PetSpot, size: number): { x: number; y: number } {
  switch (spot.at) {
    case 'floor':
      return { x: spot.x, y: world.floorY }
    case 'ledge':
      if (!world.ledge) throw new Error('바 꼭대기에 앉을 수 없는 세계')
      return { x: world.ledge.cx, y: world.ledge.y }
    case 'side':
      if (!world.side) throw new Error('바 옆면을 오를 수 없는 세계')
      return { x: world.side.x, y: world.side.bottom + (world.side.top - world.side.bottom) * spot.t }
    case 'cursor':
      // 상태 기계와 같이 발 = 커서 + (0, 54/64·크기)
      return { x: spot.x, y: spot.y + (54 / 64) * size }
  }
}

interface PetSceneOptions {
  bar: BarViewState
  spot: PetSpot
  look: Partial<PetLook>
  size?: PetSize
  reduceMotion?: boolean
  /** 펫 뒤의 창(기본: 바 반대쪽 위 작은 흰 문서 창) */
  backdrop?: React.ReactNode
  /** 앱 반응(Task 7): 상태 기계와 같은 계산(reactionFor·bubbleSlot)으로 표정·소품·말풍선을 얹는다. sunglasses는 가명 처리 기본값 켬 */
  react?: { event: AppEvent; sunglasses: boolean }
  /** 개발용: 펫 창의 모든 움직임을 이 시각(ms)에 멈춰 그린다(폴짝 꼭대기에서 말풍선과 소품 간격 확인) */
  freezeAt?: number
  /** 오른쪽 클릭 메뉴(Task 8): 상태 기계와 같은 계산(menuSlot·petMenuRows). 졸기 자세면 두 번째 행이 깨우기 */
  menu?: boolean
  /** 조종 모드(Task 8): 머리 위 조종 표시. guide면 조종을 시작한 순간(웃는 얼굴·폴짝·키 안내 말풍선) */
  control?: { guide: boolean }
}

/** 창 안 말풍선 자리(상태 기계의 bubbleView와 같은 계산: 조종 중이면 조종 표시 위로 비킨다) */
function bubbleAt(text: string, box: Rect, win: Rect, size: PetSize, controlling = false): PetView['bubble'] {
  const s = bubbleSlot({ box, window: win, bounds: MONITOR.bounds, hop: bubbleHop(size, controlling) })
  return { seq: 1, text, side: s.side, slot: { x: s.rect.x - win.x, y: s.rect.y - win.y, width: s.rect.width, height: s.rect.height } }
}

/** 상태 기계(react)와 같이 반응의 표정·소품·cue로 모습을 덮어쓰고 말풍선 자리를 계산한다 */
function reactionView(o: PetSceneOptions, box: Rect, win: Rect, size: PetSize): Pick<PetView, 'look' | 'bubble'> {
  const r = o.react ? reactionFor(o.react.event, { reactions: true, bubbles: true }) : null
  if (!o.react || !r) return { look: petLook(o.look), bubble: null }
  const look = petLook({ ...o.look, face: r.face, props: [...(o.react.sunglasses ? (['sunglasses'] as const) : []), ...r.props], cue: r.cue, cueSeq: r.cue ? 1 : 0 })
  if (!r.bubble) return { look, bubble: null }
  return { look, bubble: bubbleAt(r.bubble, box, win, size) }
}

/** 상태 기계(beginControl)와 같이: 조종 표시를 얹고, 시작한 순간이면 웃는 얼굴·폴짝·키 안내 말풍선 */
function controlView(o: PetSceneOptions, box: Rect, win: Rect, size: PetSize): Pick<PetView, 'look' | 'bubble'> {
  const base = petLook(o.look)
  const props = [...base.props, 'control' as const]
  if (!o.control?.guide) return { look: { ...base, props }, bubble: null }
  return { look: { ...base, props, face: 'happy', cue: 'hop', cueSeq: 1 }, bubble: bubbleAt(PET_CONTROL_GUIDE, box, win, size, true) }
}

/** 창 안 메뉴(상태 기계의 menuView와 같은 계산) */
function menuAt(box: Rect, win: Rect, sleeping: boolean): PetView['menu'] {
  const s = menuSlot({ rows: 4, box, window: win, bounds: MONITOR.bounds })
  return { rows: petMenuRows({ sleeping }), side: s.side, rect: { x: s.rect.x - win.x, y: s.rect.y - win.y, width: s.rect.width, height: s.rect.height } }
}

/** 바 하나와 펫 창 하나. 펫 창(320×240, 투명)은 <Pet />이 가짜 getPetView()로 받은 상태를 그린다 */
function petScene(id: string, title: string, o: PetSceneOptions): Scene {
  const size = o.size ?? 56
  const world = petWorld(MONITOR, { rect: barWindowRect(o.bar), edge: o.bar.edge }, size)
  const box = petBox(petFoot(world, o.spot, size), size)
  const win = petWindowRect(box, MONITOR.bounds)
  const view: PetView = {
    size,
    box: { x: box.x - win.x, y: box.y - win.y },
    ...(o.control ? controlView(o, box, win, size) : reactionView(o, box, win, size)),
    menu: o.menu ? menuAt(box, win, o.look.pose === 'sleep') : null,
    controlling: o.control !== undefined,
    reduceMotion: o.reduceMotion ?? false
  }
  return {
    id,
    title,
    fixtures: { petView: view },
    render: () => (
      <Desktop edge={o.bar.edge}>
        <Stage>
          {o.backdrop ?? <AppWindow side={o.bar.edge === 'right' ? 'left' : 'right'} />}
          <BarWindow state={o.bar} />
          {o.freezeAt !== undefined ? <style>{'.pet-frame * { animation-play-state: paused !important; animation-delay: var(--frame-t) !important; }'}</style> : null}
          <div
            data-pet-window=""
            className={o.freezeAt !== undefined ? 'pet-frame' : undefined}
            style={{ position: 'absolute', left: win.x, top: win.y, width: win.width, height: win.height, ...(o.freezeAt !== undefined ? { '--frame-t': `-${o.freezeAt}ms` } : {}) } as React.CSSProperties}
          >
            <Pet />
          </div>
        </Stage>
      </Desktop>
    )
  }
}

const EDGE_LEFT = barState({ edge: 'left', paletteHotkey: 'Ctrl+Alt+Space' })
const CAPSULE_RIGHT = barState({ shape: 'capsule', edge: 'right', paletteHotkey: 'Ctrl+Alt+Space' })

const GALLERY_POSES: PetPose[] = ['stand', 'walk', 'air', 'sit', 'sleep', 'climb', 'held']
const GALLERY_FACES: PetFace[] = ['normal', 'happy', 'worried', 'surprised', 'content', 'asleep', 'up']
const GALLERY_PROPS: { label: string; look: Partial<PetLook> }[] = [
  { label: '복사', look: { face: 'happy', props: ['envelope'] } },
  { label: '경고', look: { face: 'worried', props: ['alert'] } },
  { label: '꼭대기 경고', look: { pose: 'sit', face: 'worried', props: ['alert'] } },
  { label: '졸기', look: { pose: 'sleep', face: 'asleep', props: ['zzz'] } },
  { label: '조종', look: { props: ['control'] } },
  { label: '선글라스 복사', look: { face: 'happy', props: ['sunglasses', 'envelope'] } },
  { label: '선글라스 졸기', look: { pose: 'sleep', face: 'asleep', props: ['sunglasses', 'zzz'] } },
  { label: '왼쪽 걷기', look: { pose: 'walk', facing: 'left' } }
]

const galleryLabel: React.CSSProperties = { color: 'var(--text-2)', fontSize: 11, lineHeight: '14px', textAlign: 'center' }

/** 개발용: 모든 표정 × 모든 자세(멈춘 그림)와 소품 조합. 열은 표정, 마지막 열은 보통 얼굴 + 선글라스 */
function PetGallery(): React.JSX.Element {
  const cell = (key: string, look: PetLook): React.JSX.Element => (
    <div key={key} style={{ display: 'grid', placeItems: 'end center', height: 64 }}>
      <PetSprite look={look} size={56} reduceMotion />
    </div>
  )
  return (
    <Desktop edge="left">
      <div style={{ padding: '6px 12px', display: 'grid', gridTemplateColumns: '52px repeat(8, 66px)', alignItems: 'end' }}>
        <span />
        {[...GALLERY_FACES, 'normal+선글라스'].map((f) => (
          <span key={f} style={galleryLabel}>
            {f}
          </span>
        ))}
        {GALLERY_POSES.flatMap((pose) => [
          <span key={`${pose}-label`} style={{ ...galleryLabel, alignSelf: 'center' }}>
            {pose}
          </span>,
          ...GALLERY_FACES.map((face) => cell(`${pose}-${face}`, petLook({ pose, face }))),
          cell(`${pose}-shades`, petLook({ pose, props: ['sunglasses'] }))
        ])}
        <span style={{ ...galleryLabel, alignSelf: 'center' }}>소품</span>
        {GALLERY_PROPS.map((p) => (
          <div key={p.label} style={{ display: 'grid', placeItems: 'end center', height: 78 }}>
            <PetSprite look={petLook(p.look)} size={56} reduceMotion />
          </div>
        ))}
        <span />
        {GALLERY_PROPS.map((p) => (
          <span key={`${p.label}-label`} style={galleryLabel}>
            {p.label}
          </span>
        ))}
      </div>
    </Desktop>
  )
}

/** 개발용: 움직임을 시간별로 멈춰 그린다(캡처는 애니메이션 시작 직후라 중간 모습이 안 보인다) */
const FRAME_ROWS: { label: string; look: Partial<PetLook>; times: number[] }[] = [
  { label: '폴짝 0.45초(편지 함께)', look: { face: 'happy', props: ['envelope'], cue: 'hop', cueSeq: 1 }, times: [0, 40, 68, 130, 216, 290, 351, 400, 450] },
  { label: '내려앉기 0.36초', look: { cue: 'land', cueSeq: 1 }, times: [0, 50, 100, 144, 220, 290, 360] },
  { label: '통통 걷기 0.9초', look: { pose: 'walk' }, times: [0, 120, 240, 360, 500, 630, 760, 900] },
  { label: '대롱대롱 1.6초', look: { pose: 'held', face: 'surprised' }, times: [0, 400, 800, 1200] },
  { label: '숨쉬기 1.2초·깜빡임 3.8초·느낌표 떠오르기', look: { face: 'worried', props: ['alert'] }, times: [0, 1000, 1200, 3800] }
]

function PetFrames(): React.JSX.Element {
  return (
    <Desktop edge="left">
      <style>{'.pet-frame * { animation-play-state: paused !important; animation-delay: var(--frame-t) !important; }'}</style>
      <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {FRAME_ROWS.map((row) => (
          <div key={row.label}>
            <div style={{ ...galleryLabel, textAlign: 'left' }}>{row.label}</div>
            <div style={{ display: 'flex' }}>
              {row.times.map((t) => (
                <div key={t} style={{ width: 68, display: 'grid', justifyItems: 'center' }}>
                  <div className="pet-frame" style={{ '--frame-t': `-${t}ms`, paddingTop: 26 } as React.CSSProperties}>
                    <PetSprite look={petLook(row.look)} size={56} reduceMotion={false} />
                  </div>
                  <span style={galleryLabel}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Desktop>
  )
}

const PET_SCENES: Scene[] = [
  petScene('pet-stand', '말랑 메이트: 가만히(숨쉬기·깜빡임), 작업 표시줄 위', { bar: EDGE_RIGHT, spot: { at: 'floor', x: 200 }, look: {} }),
  petScene('pet-walk', '말랑 메이트: 통통 걷기(오른쪽으로, 얼굴이 가는 쪽을 봄)', { bar: EDGE_RIGHT, spot: { at: 'floor', x: 260 }, look: { pose: 'walk' } }),
  petScene('pet-climb', '말랑 메이트: 오른쪽 띠 바의 옆면 오르기(바 면에 붙음, 눈은 위)', { bar: EDGE_RIGHT, spot: { at: 'side', t: 0.5 }, look: { pose: 'climb', face: 'up' } }),
  petScene('pet-climb-left', '말랑 메이트: 왼쪽 띠 바의 옆면 오르기(좌우 뒤집힘, 선글라스)', {
    bar: EDGE_LEFT,
    spot: { at: 'side', t: 0.5 },
    look: { pose: 'climb', face: 'up', facing: 'left', props: ['sunglasses'] }
  }),
  petScene('pet-sit-edge', '말랑 메이트: 가장자리 띠 꼭대기에 앉아 쉬기(반달 눈·볼)', { bar: EDGE_RIGHT, spot: { at: 'ledge' }, look: { pose: 'sit', face: 'content' } }),
  petScene('pet-sit-capsule', '말랑 메이트: 떠 있는 캡슐 꼭대기에 앉아 쉬기', { bar: CAPSULE_RIGHT, spot: { at: 'ledge' }, look: { pose: 'sit', face: 'content' } }),
  petScene('pet-sleep', '말랑 메이트: 졸기(z는 멈춤), 흰 문서 창 앞', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 170 },
    look: { pose: 'sleep', face: 'asleep', props: ['zzz'] },
    backdrop: <AppWindow side="left" under />
  }),
  petScene('pet-held', '말랑 메이트: 집어 들림(대롱대롱, 놀란 눈과 입)', { bar: EDGE_RIGHT, spot: { at: 'cursor', x: 300, y: 180 }, look: { pose: 'held', face: 'surprised' } }),
  petScene('pet-sunglasses', '말랑 메이트: 가명 처리 켬(선글라스), 가만히', { bar: EDGE_RIGHT, spot: { at: 'floor', x: 200 }, look: { props: ['sunglasses'] } }),
  petScene('pet-sunglasses-sit', '말랑 메이트: 선글라스를 쓰고 띠 꼭대기에 앉기(선글라스가 앉은 얼굴을 따라감)', {
    bar: EDGE_RIGHT,
    spot: { at: 'ledge' },
    look: { pose: 'sit', face: 'content', props: ['sunglasses'] }
  }),
  petScene('pet-size-40', '말랑 메이트: 크기 40, 가만히', { bar: EDGE_RIGHT, spot: { at: 'floor', x: 200 }, look: {}, size: 40 }),
  // 미리 보기 화면(높이 574)에서 기본 띠 바는 위 끝이 59라 크기 72(머리 위 여유 65.25)는 띠에 오를 수 없다. 캡슐(위 끝 73)에 앉힌다
  petScene('pet-size-72', '말랑 메이트: 크기 72, 캡슐 꼭대기에 앉기', { bar: CAPSULE_RIGHT, spot: { at: 'ledge' }, look: { pose: 'sit', face: 'content' }, size: 72 }),
  petScene('pet-reduced', '말랑 메이트: 움직임 줄이기(복사 축하여도 폴짝·떠오르기 없이 멈춘 그림)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 220 },
    look: { face: 'happy', props: ['envelope'], cue: 'hop', cueSeq: 1 },
    reduceMotion: true
  }),
  { id: 'pet-gallery', title: '개발용: 말랑 메이트 모든 표정 × 자세와 소품(멈춘 그림)', fixtures: {}, render: () => <PetGallery /> },
  { id: 'pet-frames', title: '개발용: 말랑 메이트 움직임을 시간별로 멈춘 그림(폴짝·내려앉기·걷기·흔들림)', fixtures: {}, render: () => <PetFrames /> }
]

// ── 말랑 메이트 앱 반응과 말풍선(Task 7): 상태 기계와 같은 계산(reactionFor·petBubbleText·bubbleSlot) ──────────

const copied = (masked: { category: MaskCategory; count: number }[], target: string | null): AppEvent => ({ type: 'prompt-copied', masking: 'restore', masked, target })
const WARN_EVENT: AppEvent = { type: 'prompt-copied', masking: 'off', masked: [], target: 'Claude' }

const REACTION_SCENES: Scene[] = [
  petScene('pet-celebrate', '말랑 메이트 반응: 복사 축하(편지·폴짝·말풍선, 설계 예시 문장)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 200 },
    look: {},
    react: { event: copied([{ category: 'client', count: 1 }], 'Claude'), sunglasses: false }
  }),
  petScene('pet-celebrate-copy-only', '말랑 메이트 반응: 복사만(열 AI 없음 → "원하는 곳에"), 선글라스', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 200 },
    look: {},
    react: {
      event: copied(
        [
          { category: 'client', count: 2 },
          { category: 'person', count: 1 }
        ],
        null
      ),
      sunglasses: true
    }
  }),
  petScene('pet-celebrate-sunglasses', '말랑 메이트 반응: 가명 처리 켬(선글라스), 분류 넷(많은 순 두 개 + 외 N건), ChatGPT', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 230 },
    look: {},
    react: {
      event: copied(
        [
          { category: 'client', count: 2 },
          { category: 'ip', count: 2 },
          { category: 'path', count: 3 },
          { category: 'email', count: 1 }
        ],
        'ChatGPT'
      ),
      sunglasses: true
    }
  }),
  petScene('pet-warn', '말랑 메이트 반응: 가명 처리 끈 채 복사(걱정 눈썹·주황 느낌표·경고, 폴짝 없음)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 200 },
    look: {},
    react: { event: WARN_EVENT, sunglasses: false }
  }),
  petScene('pet-unmask', '말랑 메이트 반응: 가명 되돌리기(폴짝·한 줄 말풍선)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 200 },
    look: {},
    react: { event: { type: 'unmasked', restored: 3 }, sunglasses: true }
  }),
  petScene('pet-note', '말랑 메이트 반응: 선택한 글을 못 가져옴(터미널), 흰 문서 창 앞(외곽선 대비)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 170 },
    look: {},
    backdrop: <AppWindow side="left" under />,
    react: { event: { type: 'capture-failed', reason: 'terminal' }, sunglasses: true }
  }),
  petScene('pet-bubble-side', '말랑 메이트 반응: 바 꼭대기가 화면 위쪽(위에 자리가 없어 말풍선이 옆, 가장 긴 4줄)', {
    bar: EDGE_RIGHT,
    spot: { at: 'ledge' },
    look: { pose: 'sit' },
    react: {
      event: copied(
        [
          { category: 'project', count: 12 },
          { category: 'person', count: 10 },
          { category: 'phone', count: 8 },
          { category: 'email', count: 17 }
        ],
        'ChatGPT'
      ),
      sunglasses: true
    }
  }),
  petScene('pet-react-climb', '개발용: 왼쪽 띠 옆면을 오르다 경고(소품은 바 반대쪽, 꼬리는 뒤집힌 얼굴)', {
    bar: EDGE_LEFT,
    spot: { at: 'side', t: 0.5 },
    look: { pose: 'climb', facing: 'left' },
    react: { event: WARN_EVENT, sunglasses: false }
  }),
  petScene('pet-bubble-narrow', '개발용: 화면 위쪽 가운데(양옆 여유가 모자람 → 좁고 긴 말풍선, 창 안)', {
    bar: EDGE_RIGHT,
    spot: { at: 'cursor', x: 320, y: 4 },
    look: {},
    react: { event: copied([{ category: 'client', count: 1 }], 'Claude'), sunglasses: true }
  }),
  petScene('pet-celebrate-apex', '개발용: 복사 축하 폴짝 꼭대기(216ms)에서 멈춤(편지가 말풍선 꼬리에 닿지 않음)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 200 },
    look: {},
    react: { event: copied([{ category: 'client', count: 1 }], 'Claude'), sunglasses: true },
    freezeAt: 216
  })
]

// ── 말랑 메이트 오른쪽 클릭 메뉴와 조종 모드(Task 8): 상태 기계와 같은 계산(menuSlot·petMenuRows·bubbleSlot) ──────────

const MENU_SCENES: Scene[] = [
  petScene('pet-menu', '말랑 메이트 메뉴: 바닥에서 오른쪽 클릭(펫 위 4행, M5 펼침 메뉴와 같은 가족)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 200 },
    look: {},
    menu: true
  }),
  petScene('pet-menu-sleeping', '말랑 메이트 메뉴: 졸고 있을 때(두 번째 행 깨우기), 흰 문서 창 앞(그림자·테두리 대비)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 170 },
    look: { pose: 'sleep', face: 'asleep', props: ['zzz'] },
    backdrop: <AppWindow side="left" under />,
    menu: true
  }),
  petScene('pet-menu-side', '말랑 메이트 메뉴: 바 꼭대기가 화면 위쪽(위에 자리가 없어 펫 옆, 창 안)', {
    bar: EDGE_RIGHT,
    spot: { at: 'ledge' },
    look: { pose: 'sit', face: 'content', props: ['sunglasses'] },
    menu: true
  }),
  petScene('pet-control', '말랑 메이트 조종: 시작한 순간(머리 위 조종 표시·웃는 얼굴·키 안내 말풍선)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 200 },
    look: {},
    control: { guide: true }
  }),
  petScene('pet-control-walk', '개발용: 조종 중 걷기(조종 표시만, 선글라스)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 260 },
    look: { pose: 'walk', props: ['sunglasses'] },
    control: { guide: false }
  }),
  petScene('pet-control-sit', '개발용: 조종 중 바 꼭대기에 앉음(조종 표시가 납작한 머리 위에)', {
    bar: CAPSULE_RIGHT,
    spot: { at: 'ledge' },
    look: { pose: 'sit', face: 'content' },
    control: { guide: false }
  }),
  petScene('pet-control-climb', '개발용: 조종 중 왼쪽 띠 옆면에 붙음(조종 표시가 위를 보는 머리 위에, 좌우 뒤집힘)', {
    bar: EDGE_LEFT,
    spot: { at: 'side', t: 0.5 },
    look: { pose: 'climb', face: 'up', facing: 'left' },
    control: { guide: false }
  }),
  petScene('pet-control-apex', '개발용: 조종 시작 폴짝 꼭대기(216ms)에서 멈춤(조종 표시가 말풍선 꼬리에 닿지 않는지)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 200 },
    look: {},
    control: { guide: true },
    freezeAt: 216
  }),
  petScene('pet-menu-side-left', '개발용: 왼쪽 띠 꼭대기의 메뉴(펫 오른쪽)', {
    bar: EDGE_LEFT,
    spot: { at: 'ledge' },
    look: { pose: 'sit', face: 'content', facing: 'left' },
    menu: true
  }),
  petScene('pet-menu-edge', '개발용: 화면 왼쪽 끝 바닥의 메뉴(창이 화면 끝에 멈춤 → 메뉴가 창 여백 8에 붙음, 그림자 잘림 확인)', {
    bar: EDGE_RIGHT,
    spot: { at: 'floor', x: 40 },
    look: {},
    backdrop: <AppWindow side="left" under />,
    menu: true
  })
]

// ── 팔레트 장면: 기본 프롬프트·상용구 팩과 용어 팩, main과 같은 제목의 명령, 가상 워크스페이스를 실제 검색으로 ──────────

const firstLine = (s: string): string => s.split('\n', 1)[0].trim()
/** 이름이 긴 내 프롬프트(가상, 이름 상한 40자). 의도 표시·기억하기 안내가 긴 제목을 덮지 않는지 본다 */
const LONG_PROMPT: PaletteItem = {
  id: 'prompt:my-trace',
  group: 'prompt',
  title: '가상자동차 차체제어기 요구사항 추적표 정리·누락 항목 확인·공유용 상세판',
  subtitle: '요구사항 ID·설계·시험 항목을 한 표로 묶고 빠진 연결을 찾아요',
  keywords: ['추적표', '요구사항 추적']
}
/** main의 명령 항목과 같은 제목·부제(가명 처리 모드는 바꾸고 되돌리기, 바는 가장자리 띠) */
const PALETTE_COMMANDS: PaletteItem[] = [
  { id: 'cmd.unmask', group: 'command', title: '가명 되돌리기', subtitle: 'AI가 쓴 글을 복사한 뒤 실행하면 CLIENT_A 같은 가명을 원래 이름으로 바꿔 클립보드에 넣어요', keywords: ['unmask', 'restore', '복원', '되돌리기', '원래 이름', '가명'] },
  { id: 'cmd.mask-selection', group: 'command', title: '선택한 글 가명 처리', subtitle: '템플릿 없이 고객사·IP·경로만 가려 클립보드에 넣어요', keywords: ['mask', 'masking', '가리기', '익명', '가명'] },
  { id: 'cmd.masking-mode', group: 'command', title: '가명 처리 기본값 바꾸기', subtitle: '지금: 바꾸고 되돌리기 · 누르면 바꾸기만', keywords: ['masking', 'mode', '모드', '끄기', '켜기', '가명'] },
  { id: 'cmd.open-dictionary', group: 'command', title: '가명 사전 열기', subtitle: '가릴 고객사·프로젝트 이름을 적는 파일(이 PC에만 저장)', keywords: ['dictionary', 'masking', '사전', '고객사', '가명'] },
  { id: 'cmd.open-intents', group: 'command', title: '말하듯 입력 단어 목록 열기', subtitle: '‘해줘’ 같은 어미와 의도 단어를 고치는 파일(이 PC에만 저장)', keywords: ['intents', 'natural', '단어', '말하듯', '어미', '조사'] },
  { id: 'cmd.glossary-export', group: 'command', title: '용어 팩 내보내기', subtitle: '내가 추가·고친 용어를 파일로 저장해 팀과 나눠요', keywords: ['export', '내보내기', '용어 팩'] },
  { id: 'cmd.glossary-import', group: 'command', title: '용어 팩 가져오기', subtitle: '받은 용어 팩 파일을 미리 보고 내 용어에 더해요', keywords: ['import', '가져오기', '용어 팩'] },
  { id: 'cmd.bar-shape', group: 'command', title: 'Sure-Mate 바 모양 바꾸기', subtitle: '지금: 가장자리 띠 · 누르면 떠 있는 캡슐', keywords: ['bar', 'shape', '바', '모양'] },
  { id: 'cmd.open-settings', group: 'command', title: '설정 열기', subtitle: '단축키·AI·프롬프트·가명 처리·용어 사전·바를 바꿔요', keywords: ['설정', 'settings', '환경설정', '옵션', 'preferences'] }
]
/** workspacePaletteItems와 같은 모양의 가상 워크스페이스(최근에 바꾼 순서) */
const PALETTE_WORKSPACES: PaletteItem[] = [
  { id: 'cmd.workspace-save', group: 'workspace', title: '지금 배치 저장', subtitle: '지금 열린 창 위치를 새 워크스페이스로 저장해요', keywords: ['save', 'workspace', 'layout', '워크스페이스', '레이아웃', '창 배치', '배치 저장'] },
  { id: 'workspace:ws-report', group: 'workspace', title: '보고서 모드', subtitle: '창 3개 · Ctrl+Alt+2', keywords: ['보고'] },
  { id: 'workspace:ws-qa', group: 'workspace', title: 'QA 모드', subtitle: '창 4개 · Ctrl+Alt+1', keywords: ['qa', '시험', '테스트'] },
  { id: 'workspace:ws-meeting', group: 'workspace', title: '회의 모드', subtitle: '창 2개 · 다른 모니터 구성', keywords: ['미팅 화면'] }
]
const PALETTE_ITEMS: PaletteItem[] = [
  ...parseTemplatePack(builtinPrompts, 'builtin').templates.map(
    (t): PaletteItem => ({ id: `${t.kind}:${t.id}`, group: t.kind === 'snippet' ? 'snippet' : 'prompt', title: t.name, subtitle: t.description, keywords: [...t.aliases, ...(t.group ? [t.group] : [])] })
  ),
  LONG_PROMPT,
  ...PALETTE_COMMANDS,
  ...PALETTE_WORKSPACES,
  ...PACK.map((e): PaletteItem => ({ id: `wiki:${e.id}`, group: 'wiki', title: e.term, subtitle: firstLine(e.definition), keywords: [...e.aliases], body: e.definition, tags: [...e.tags] }))
]
const usedAgo = (minutes: number, count: number): UsageRecord => ({ count, lastAt: new Date(Date.now() - minutes * 60_000).toISOString() })

/**
 * 팔레트 창 크기(720×460 DIP) 그대로 그린다(캡처 크기도 720×460). 팔레트 바탕은 반투명이라 뒤에 가짜 바탕화면 색을 깐다.
 * keys: 목록이 그려진 뒤 입력칸에 보낼 키(사람이 ↓를 누른 것처럼). 캡처는 가상 시간 3초 시점이라 늘 같다.
 */
function PaletteStage({ keys = [] }: { keys?: string[] }): React.JSX.Element {
  useEffect(() => {
    // 키마다 0.15초 간격(앞 키로 바뀐 선택이 그려진 뒤 다음 키를 받게)
    const timers = keys.map((key, i) =>
      setTimeout(
        () => document.querySelector('[cmdk-input]')?.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true })),
        500 + i * 150
      )
    )
    return () => timers.forEach(clearTimeout)
  }, [keys])
  return (
    <div style={{ width: 720, height: 460, background: 'linear-gradient(135deg, #22355E 0%, #3B4F86 55%, #6A5B9A 100%)' }}>
      <Palette />
    </div>
  )
}

function paletteScene(
  id: string,
  title: string,
  o: { query: string; keys?: string[]; usage?: [string, UsageRecord][]; learned?: [string, string][] }
): Scene {
  return {
    id,
    title,
    fixtures: {
      status: { paletteHotkey: 'Ctrl+Alt+Space', maskingMode: 'restore', aiTargetName: 'Claude' },
      items: PALETTE_ITEMS,
      shown: { mode: 'search', query: o.query },
      searchContext: { learned: o.learned ?? [], usage: o.usage ?? [] }
    },
    render: () => <PaletteStage keys={o.keys} />
  }
}

const PALETTE_SCENES: Scene[] = [
  paletteScene('palette-natural-prompt', '팔레트: 말하듯 입력 ‘회의록 정리해줘’(맨 위 의도 표시 프롬프트)', { query: '회의록 정리해줘' }),
  paletteScene('palette-natural-workspace', '팔레트: ‘보고서 모드로 바꿔줘’(맨 위 의도 표시 창 배치)', { query: '보고서 모드로 바꿔줘' }),
  paletteScene('palette-remember', '팔레트: ‘보고서 띄워줘’에서 둘째 행을 고름(Shift+Enter 기억하고 실행)', { query: '보고서 띄워줘', keys: ['ArrowDown'] }),
  paletteScene('palette-remember-long', '팔레트: ‘가명 되돌려줘’의 셋째 행(긴 부제가 먼저 줄고 안내는 그대로, 맨 위는 긴 부제와 의도 표시)', {
    query: '가명 되돌려줘',
    keys: ['ArrowDown', 'ArrowDown']
  }),
  paletteScene('palette-learned', '팔레트: 기억한 문장(‘보고서 띄워줘’ → 보고서 모드)이 맨 위', { query: '보고서 띄워줘', learned: [['보고서띄워줘', 'workspace:ws-report']] }),
  paletteScene('palette-empty-recent', '팔레트: 빈 검색어(최근 구역 5개와 사용 팁 한 줄)', {
    query: '',
    usage: [
      ['prompt:meeting-notes', usedAgo(5, 12)],
      ['workspace:ws-report', usedAgo(40, 4)],
      ['snippet:mail-signature', usedAgo(180, 6)],
      ['wiki:mcdc', usedAgo(1440, 2)],
      ['cmd.unmask', usedAgo(2880, 3)]
    ]
  }),
  paletteScene('palette-english-mode', '팔레트: 영문 자판으로 친 ‘ghldmlfhr wjdflgownj’(회의록 정리)', { query: 'ghldmlfhr wjdflgownj' }),
  paletteScene('palette-chip-long', '팔레트: 이름이 40자인 맨 위 후보(부제가 먼저 줄고 의도 표시는 그대로)', { query: '추적표 정리해줘' }),
  paletteScene('palette-remember-long-title', '팔레트: 기억한 문장 아래 40자 이름 행을 고름(안내 자리를 위해 제목이 말줄임으로 줄어듦)', {
    query: '추적표 정리해줘',
    learned: [['추적표정리해줘', 'prompt:meeting-notes']],
    keys: ['ArrowDown']
  }),
  paletteScene('palette-prefix-workspace', '팔레트: 접두어 검색 ‘@QA’(맨 위 의도 표시 창 배치)', { query: '@QA' })
]

/** 설정 창 프롬프트 탭 미리 보기(기본 팩 일부 + 가상 내 템플릿) */
const PREVIEW_TEMPLATES: Template[] = [
  { id: 'meeting-notes', name: '회의록 정리', aliases: ['회의록'], kind: 'prompt', description: '회의 메모를 결정·할 일로 정리', body: '정리해 줘\n{{selection}}', scope: 'personal' },
  { id: 'req-to-testcase', name: '요구사항 → 테스트 케이스', aliases: [], kind: 'prompt', description: '요구사항에서 시험 항목 뽑기', body: '{{selection}}', scope: 'builtin' },
  { id: 'polish', name: '문장 다듬기', aliases: [], kind: 'prompt', body: '{{selection}}', scope: 'builtin' },
  { id: 'my-weekly', name: '주간 보고 다듬기', aliases: ['주간'], kind: 'prompt', description: '가상자동차 과제 주간 보고', body: '{{selection}}', scope: 'personal' },
  { id: 'defect-report', name: '결함 리포트', aliases: ['issue'], kind: 'snippet', description: '결함 리포트 양식', body: '[결함 제목]', scope: 'builtin' },
  { id: 'team-greeting', name: '팀 인사말', aliases: [], kind: 'snippet', body: '안녕하세요', scope: 'imported' }
]

// 워크스페이스 탭(설계 §11): 가상 창 제목만(가상자동차, XY방산, SureMate-WS-*). 모니터는 시험과 같은 P(주, 100%)·L(내장, 150%, 왼쪽)

const WS_FP = monitorFingerprint([P, L])
const WS_MONITORS = [toSavedMonitor(P), toSavedMonitor(L)]
const KP = monitorKey(P)
const KL = monitorKey(L)

function wsRule(
  id: string,
  exe: string,
  title: string,
  monitor: string,
  rect: RatioRect,
  o: { order: number; maximized?: boolean; enabled?: boolean; titleIncludes?: string }
): WindowRule {
  return {
    id,
    enabled: o.enabled ?? true,
    match: { exe, ...(o.titleIncludes ? { titleIncludes: o.titleIncludes } : {}) },
    savedTitle: title,
    target: { monitor, rect: o.maximized ? { x: 0, y: 0, w: 1, h: 1 } : rect, state: o.maximized ? 'maximized' : 'normal' },
    order: o.order
  }
}

function previewWorkspace(id: string, name: string, windows: WindowRule[], o: Partial<Pick<Workspace, 'aliases' | 'hotkey' | 'updatedAt'>> = {}): Workspace {
  return { id, name, aliases: o.aliases ?? [], hotkey: o.hotkey ?? null, layouts: { [WS_FP]: { monitors: WS_MONITORS, windows } }, updatedAt: o.updatedAt ?? '2026-11-10T09:00:00.000Z' }
}

/** QA 모드: 주 모니터 왼쪽·오른쪽 절반의 Excel 두 개, 내장 화면 왼쪽 위 메모장, 내장 화면에서 최대화한 Chrome(뺌) */
const WS_QA = previewWorkspace(
  'ws-qa',
  'QA 모드',
  [
    wsRule('r1', 'EXCEL.EXE', '가상자동차 보고서.xlsx - Excel', KP, { x: 0, y: 0, w: 0.5, h: 1 }, { order: 0, titleIncludes: '가상자동차 보고서.xlsx' }),
    wsRule('r2', 'EXCEL.EXE', 'XY방산 예산.xlsx - Excel', KP, { x: 0.5, y: 0, w: 0.5, h: 1 }, { order: 1, titleIncludes: 'XY방산 예산.xlsx' }),
    wsRule('r3', 'notepad.exe', 'SureMate-WS-A - Windows 메모장', KL, { x: 0.04, y: 0.06, w: 0.5, h: 0.55 }, { order: 2 }),
    wsRule('r4', 'chrome.exe', '가상자동차 사내 포털 - Chrome', KL, { x: 0, y: 0, w: 1, h: 1 }, { order: 3, maximized: true, enabled: false })
  ],
  { aliases: ['qa', '시험'], hotkey: 'Ctrl+Alt+1', updatedAt: '2026-11-11T09:00:00.000Z' }
)

const WS_REPORT = previewWorkspace(
  'ws-report',
  '보고서 모드',
  [
    wsRule('p1', 'WINWORD.EXE', 'XY방산 시험 결과 보고서.docx - Word', KP, { x: 0, y: 0, w: 0.62, h: 1 }, { order: 0 }),
    wsRule('p2', 'EXCEL.EXE', '가상자동차 시험 항목.xlsx - Excel', KP, { x: 0.62, y: 0, w: 0.38, h: 0.6 }, { order: 1 }),
    wsRule('p3', 'notepad.exe', 'SureMate-WS-B - Windows 메모장', KP, { x: 0.62, y: 0.6, w: 0.38, h: 0.4 }, { order: 2 })
  ],
  { updatedAt: '2026-11-10T09:00:00.000Z' }
)

/** 창 12개(Excel·Word·메모장·Chrome·탐색기 등, 두 모니터에 격자로) */
const MANY_APPS: [string, string][] = [
  ['EXCEL.EXE', '가상자동차 보고서.xlsx - Excel'],
  ['EXCEL.EXE', 'XY방산 예산.xlsx - Excel'],
  ['EXCEL.EXE', '가상자동차 시험 항목.xlsx - Excel'],
  ['WINWORD.EXE', 'XY방산 시험 결과 보고서.docx - Word'],
  ['WINWORD.EXE', '가상자동차 회의록.docx - Word'],
  ['POWERPNT.EXE', '가상자동차 주간 보고.pptx - PowerPoint'],
  ['notepad.exe', 'SureMate-WS-A - Windows 메모장'],
  ['notepad.exe', 'SureMate-WS-B - Windows 메모장'],
  ['chrome.exe', '가상자동차 사내 포털 - Chrome'],
  ['chrome.exe', 'XY방산 협업 게시판 - Chrome'],
  ['explorer.exe', '시험 자료 - 파일 탐색기'],
  ['powershell.exe', 'SureMate-WS-C']
]
const WS_MANY = previewWorkspace(
  'ws-many',
  '시험장 전체',
  MANY_APPS.map(([exe, title], i) =>
    wsRule(`m${i + 1}`, exe, title, i < 6 ? KP : KL, { x: (i % 3) / 3, y: Math.floor((i % 6) / 3) / 2, w: 1 / 3, h: 1 / 2 }, {
      order: i,
      enabled: i !== 7,
      titleIncludes: ['EXCEL.EXE', 'WINWORD.EXE', 'notepad.exe', 'chrome.exe'].includes(exe) ? title.split(' - ')[0] : undefined
    })
  ),
  { aliases: ['전체'], hotkey: 'Ctrl+Alt+9', updatedAt: '2026-11-09T09:00:00.000Z' }
)

const WS_THREE = previewWorkspace(
  'ws-3',
  '배치 3',
  [
    wsRule('t1', 'EXCEL.EXE', '가상자동차 보고서.xlsx - Excel', KP, { x: 0, y: 0, w: 1, h: 1 }, { order: 0, maximized: true }),
    wsRule('t2', 'notepad.exe', 'SureMate-WS-A - Windows 메모장', KL, { x: 0.1, y: 0.1, w: 0.6, h: 0.7 }, { order: 1 })
  ],
  { hotkey: 'Ctrl+Alt+M', updatedAt: '2026-11-08T09:00:00.000Z' }
)

const wsView = (workspace: Workspace, o: { sameConfig?: boolean; registered?: boolean } = {}): WorkspaceListView['items'][number] => ({
  workspace,
  sameConfig: o.sameConfig ?? true,
  hotkeyRegistered: o.registered ?? workspace.hotkey !== null
})

/** 목록 세 개: QA 모드(단축키 쓰는 중), 보고서 모드(다른 모니터 구성), 배치 3(단축키를 다른 앱이 써서 등록 못 함) */
const WS_LIST: WorkspaceListView = {
  items: [wsView(WS_QA), wsView(WS_REPORT, { sameConfig: false }), wsView(WS_THREE, { registered: false })],
  canControl: true
}

/**
 * 워크스페이스 탭 장면: 880×640 설정 창. open을 주면 그 워크스페이스를 연 채로(main이 연 것처럼 이름 칸을 골라 둔 뒤
 * prep.blur로 풀어 기본 모습을 찍는다)
 */
function workspaceScene(
  id: string,
  title: string,
  list: WorkspaceListView,
  o: { open?: string; prep?: ScenePrepOptions; width?: number; height?: number } = {}
): Scene {
  return {
    id,
    title,
    fixtures: { settings: settingsSnapshot(), workspaces: list },
    render: () => (
      <div style={{ width: o.width ?? 880, height: o.height ?? 640, overflow: 'hidden', position: 'relative' }}>
        <SettingsApp initialTab="workspace" initialWorkspace={o.open ?? null} />
        {o.prep ? <ScenePrep {...o.prep} /> : null}
      </div>
    )
  }
}

const WORKSPACE_SCENES: Scene[] = [
  workspaceScene('settings-workspace', '설정: 워크스페이스 QA 모드(창 4개, Chrome은 뺌·최대화, 단축키 쓰는 중, 첫 줄 강조)', WS_LIST, {
    open: 'ws-qa',
    prep: { blur: true }
  }),
  workspaceScene('settings-workspace-rules', '설정: QA 모드 창 배치까지 내림(메모장 줄을 골라 그림에서 강조)', WS_LIST, {
    open: 'ws-qa',
    prep: { blur: true, hover: '[data-rule="r3"]' }
  }),
  workspaceScene('settings-workspace-other-config', '설정: 다른 모니터 구성에서 저장한 워크스페이스(주의 줄, 단축키 없음)', WS_LIST, { open: 'ws-report', prep: { blur: true } }),
  workspaceScene('settings-workspace-recording', '설정: 워크스페이스 단축키 바꾸기를 눌러 녹화 중', WS_LIST, { open: 'ws-qa', prep: { click: '단축키 바꾸기' } }),
  workspaceScene('settings-workspace-hotkey-in-use', '설정: 워크스페이스 단축키를 다른 앱이 써서 등록 못 함(최대화한 Excel)', WS_LIST, {
    open: 'ws-3',
    prep: { blur: true }
  }),
  workspaceScene(
    'settings-workspace-many',
    '설정: 창 12개(하나는 뺌) — 아래 줄을 골라 내려도 그림은 위에 붙어 그 창을 강조',
    { ...WS_LIST, items: [wsView(WS_MANY), ...WS_LIST.items] },
    { open: 'ws-many', prep: { blur: true, hover: '[data-rule="m10"]' } }
  ),
  workspaceScene('settings-workspace-list', '설정: 워크스페이스 목록(3개: 쓰는 중·다른 모니터 구성·등록 못 함)', WS_LIST),
  workspaceScene('settings-workspace-empty', '설정: 저장한 워크스페이스 없음', { items: [], canControl: true }),
  workspaceScene('settings-workspace-blocked', '설정: 보안 프로그램이 창 제어를 막음(저장·불러오기 단추 막힘, 편집은 됨)', { ...WS_LIST, canControl: false }, {
    open: 'ws-qa',
    prep: { blur: true }
  }),
  workspaceScene('settings-workspace-narrow', '설정: 워크스페이스, 가장 좁은 창 720×520(그림과 단추가 편집 칸 위로)', WS_LIST, {
    open: 'ws-qa',
    prep: { blur: true, top: true },
    width: 720,
    height: 520
  }),
  workspaceScene('settings-workspace-narrow-rules', '설정: 워크스페이스, 가장 좁은 창 720×520의 창 배치(두 번째 Excel 줄을 고름)', WS_LIST, {
    open: 'ws-qa',
    prep: { blur: true, hover: '[data-rule="r2"]' },
    width: 720,
    height: 520
  }),
  workspaceScene('settings-workspace-list-narrow', '설정: 워크스페이스 목록, 가장 좁은 창 720×520', WS_LIST, { width: 720, height: 520 })
]

// 말하듯 입력 탭(설계 §13 8단계·§14): 가상 문장('출근 세팅해줘'·'주간 보고 띄워줘' 등)과 가상 항목 이름만

/** 기억한 문장이 여는 항목(실제 명령·기본 프롬프트 이름, 가상 워크스페이스) */
const NATURAL_ITEMS: PaletteItem[] = [
  { id: 'workspace:ws-qa', group: 'workspace', title: 'QA 모드' },
  { id: 'workspace:ws-report', group: 'workspace', title: '보고서 모드' },
  { id: 'cmd.workspace-save', group: 'workspace', title: '지금 배치 저장' },
  { id: 'prompt:weekly-report', group: 'prompt', title: '주간보고 초안' },
  { id: 'prompt:meeting-notes', group: 'prompt', title: '회의록 정리' },
  { id: 'cmd.unmask', group: 'command', title: '가명 되돌리기' },
  { id: 'cmd.mask-selection', group: 'command', title: '선택한 글 가명 처리' },
  { id: 'cmd.masking-mode', group: 'command', title: '가명 처리 기본값 바꾸기' },
  { id: 'cmd.open-dictionary', group: 'command', title: '가명 사전 열기' }
]

/** 기억한 문장 다섯(하나는 지운 워크스페이스를 가리켜 지금 없는 항목). 파일 순서는 섞어 둔다(화면은 최근 것부터) */
const NATURAL_PHRASES: PhraseEntry[] = [
  { key: '가명풀어줘', id: 'cmd.unmask', at: '2026-11-09T10:00:00.000Z' },
  { key: '지난달보고서열어줘', id: 'workspace:ws-old', at: '2026-11-08T17:20:00.000Z' },
  { key: '회의록정리부탁해', id: 'prompt:meeting-notes', at: '2026-11-10T14:05:00.000Z' },
  { key: '주간보고띄워줘', id: 'prompt:weekly-report', at: '2026-11-11T08:30:00.000Z' },
  { key: '출근세팅해줘', id: 'workspace:ws-qa', at: '2026-11-11T09:10:00.000Z' }
]

const NATURAL_PACK = parseIntentPack(builtinIntents).pack!

function naturalView(o: { phrases?: PhraseEntry[]; usage?: number; intents?: Partial<IntentState> } = {}): NaturalView {
  return buildNaturalView({
    rev: 1,
    entries: o.phrases ?? NATURAL_PHRASES,
    phraseMax: 300,
    usageCount: o.usage ?? 23,
    intents: { pack: NATURAL_PACK, source: 'builtin', errors: [], ...o.intents },
    items: NATURAL_ITEMS
  })
}

/** 말하듯 입력 탭 장면: 880×640 설정 창(width·height로 가장 좁은 창 720×520) */
function naturalScene(id: string, title: string, view: NaturalView, o: { prep?: ScenePrepOptions; width?: number; height?: number } = {}): Scene {
  return {
    id,
    title,
    fixtures: { settings: settingsSnapshot(), natural: view },
    render: () => (
      <div style={{ width: o.width ?? 880, height: o.height ?? 640, overflow: 'hidden', position: 'relative' }}>
        <SettingsApp initialTab="natural" />
        {o.prep ? <ScenePrep {...o.prep} /> : null}
      </div>
    )
  }
}

/** 파일에서 일부 값을 읽지 못한 사용자 단어 목록(순번·까닭만) */
const PARTIAL_ERRORS = ['군말 2번째: 중복', '어미 7번째: 문자열이 아님', '어미 12번째: 20자 초과', '규칙 meeting: 대상이 없어 제외']

const NATURAL_SCENES: Scene[] = [
  naturalScene('settings-natural', '설정: 말하듯 입력(기억한 문장 다섯, 하나는 지금 없는 항목, 사용 기록 23개, 기본 단어 목록)', naturalView()),
  naturalScene('settings-natural-end', '설정: 말하듯 입력 아래쪽(단어 목록·의도 단어 아홉, 기본 목록)', naturalView(), { prep: { scrollEnd: true } }),
  naturalScene('settings-natural-words', '설정: 말하듯 입력 단어 목록(기본 목록, 아직 파일 없음)', naturalView(), { prep: { scrollTo: '[data-intents-path]' } }),
  naturalScene('settings-natural-empty', '설정: 말하듯 입력, 기억한 문장·사용 기록 없음(Shift+Enter 안내), 내 단어 목록 파일', naturalView({ phrases: [], usage: 0, intents: { source: 'user' } })),
  naturalScene('settings-natural-armed', '설정: 기억한 문장 [모두 지우기]를 한 번 눌러 확인을 기다림', naturalView(), { prep: { pressText: '모두 지우기' } }),
  naturalScene(
    'settings-natural-file-broken',
    '설정: 단어 목록 파일을 읽지 못해 기본 목록을 씀(까닭: 읽지 못함(PARSE))',
    naturalView({ intents: { source: 'builtin', errors: ['읽지 못함(PARSE)'] } }),
    { prep: { scrollTo: '[data-intents-path]' } }
  ),
  naturalScene(
    'settings-natural-file-partial',
    '설정: 내 단어 목록 파일에서 네 건을 빼고 씀(앞 세 건과 외 1건), [단어 목록 파일 열기]를 눌러 열 프로그램 없음',
    naturalView({ intents: { source: 'user', errors: PARTIAL_ERRORS } }),
    { prep: { scrollTo: '[data-intents-path]', pressText: '단어 목록 파일 열기' } }
  ),
  naturalScene('settings-natural-narrow', '설정: 말하듯 입력, 가장 좁은 창 720×520', naturalView(), { width: 720, height: 520 })
]

// ── 첫 실행 안내 세 화면(720×520, SCENE_W=720 SCENE_H=520으로 찍는다)과 30초 따라 해 보기, 확인 화면의 가명 처리 첫 안내 ──────────

const TRY_WS = { id: 'ws-try', name: '업무 배치', windows: 5 }

/** 첫 실행 안내 장면: 720×520 창 하나. tweak으로 설정 스냅숏을 바꾸고(단축키 등록 못 함 등), prep으로 단추를 눌러 펼친 모습을 찍는다 */
function onboardingScene(
  id: string,
  title: string,
  start: Partial<OnboardingState>,
  o: { tweak?: (s: SettingsSnapshot) => void; canControl?: boolean; prep?: ScenePrepOptions } = {}
): Scene {
  const snapshot = settingsSnapshot()
  o.tweak?.(snapshot)
  return {
    id,
    title,
    fixtures: {
      settings: snapshot,
      hotkeyCandidates: [
        { acc: 'Alt+Space', available: true, suggested: false },
        { acc: 'Ctrl+Alt+Space', available: false, suggested: false },
        { acc: 'Alt+`', available: true, suggested: true }
      ],
      workspaces: { items: [], canControl: o.canControl ?? true }
    },
    render: () => (
      <div style={{ width: 720, height: 520, overflow: 'hidden', position: 'relative' }}>
        <Onboarding start={start} />
        {o.prep ? <ScenePrep {...o.prep} /> : null}
      </div>
    )
  }
}

/** 팔레트 단축키를 하나도 등록하지 못한 상태(기본 조합·대체 조합을 다른 앱이 씀) */
const paletteUnregistered = (s: SettingsSnapshot): void => {
  s.hotkeys.palette = { acc: 'Ctrl+Alt+Space', registered: false }
}

const ONBOARDING_SCENES: Scene[] = [
  onboardingScene('onboarding-intro', '첫 실행 안내 1/3: 소개(업무 순간 네 가지)', {}),
  onboardingScene('onboarding-workspace', '첫 실행 안내 2/3: 워크스페이스 체험(저장 전)', {
    step: 'workspace'
  }),
  onboardingScene(
    'onboarding-workspace-saved',
    '첫 실행 안내 2/3: 저장 뒤(팔레트로 불러오기 안내)',
    { step: 'workspace', workspace: TRY_WS }
  ),
  onboardingScene('onboarding-workspace-success', '첫 실행 안내 2/3: 불러오기를 해냄', {
    step: 'workspace',
    workspace: TRY_WS,
    restored: true
  }),
  onboardingScene(
    'onboarding-workspace-blocked',
    '첫 실행 안내 2/3: 보안 프로그램이 창 제어를 막음(실패)',
    { step: 'workspace' },
    { canControl: false }
  ),
  onboardingScene('onboarding-ready', '첫 실행 안내 3/3: 준비 완료(팔레트 단축키 등록됨)', {
    step: 'ready'
  }),
  onboardingScene(
    'onboarding-ready-no-hotkey',
    '첫 실행 안내 3/3: 팔레트 단축키를 등록하지 못함(고르기 펼침, 시작하기 막힘)',
    { step: 'ready' },
    { tweak: paletteUnregistered }
  ),
  onboardingScene(
    'onboarding-ready-change',
    '첫 실행 안내 3/3: 가명 처리 [바꾸기]를 펼침',
    { step: 'ready' },
    { prep: { pressText: '가명 처리 바꾸기' } }
  )
]

/** 30초 따라 해 보기 장면: 720×520 창 하나. dictionary: 가명 사전(처음 설치하면 비어 있다) */
function tryScene(
  id: string,
  title: string,
  o: { tried?: boolean; dictionary?: MaskTerm[]; tweak?: (s: SettingsSnapshot) => void } = {}
): Scene {
  const snapshot = settingsSnapshot()
  o.tweak?.(snapshot)
  return {
    id,
    title,
    fixtures: { settings: snapshot, dictionary: o.dictionary ?? [] },
    render: () => (
      <div style={{ width: 720, height: 520, overflow: 'hidden', position: 'relative' }}>
        <TryScreen start={{ tried: o.tried }} />
      </div>
    )
  }
}

/** '가명 사전 열기'를 처음 할 때 앱이 만드는 가상 예시 사전 */
const EXAMPLE_DICTIONARY: MaskTerm[] = [
  { id: 'example-client-1', category: 'client', canonical: '가상자동차', aliases: ['가상차'] },
  { id: 'example-client-2', category: 'client', canonical: 'XY방산', aliases: [] }
]

const TRY_SCENES: Scene[] = [
  tryScene('try', '30초 따라 해 보기: 처음 설치(가명 사전 비어 있음, IP가 처음 바뀜)'),
  tryScene('try-done', '30초 따라 해 보기: 해냄(붙여넣기, 가명 되돌리기)', { tried: true }),
  tryScene(
    'try-dictionary',
    '30초 따라 해 보기: 가명 사전에 가상자동차가 있음(CLIENT_A), 기본 AI 사내 LLM',
    {
      dictionary: EXAMPLE_DICTIONARY,
      tweak: (s) => {
        s.settings.ai.defaultTarget = 'custom-llm'
      }
    }
  )
]

/** 따라 해 보기 메모를 회의록 정리 템플릿에 넣고 IP·경로를 바꾼 미리 보기(처음 설치: 가명 사전이 비어 회사 이름은 그대로) */
function tryPreview(): PromptPreview {
  const head = '다음 회의 메모를 정리해 주세요.\n\n'
  const body = TRY_MEMO.replace('10.0.3.15', 'IP_1').replace('C:\\가상자동차\\시험결과', 'PATH_1')
  const text = head + body
  const at = (word: string): [number, number] => {
    const i = text.indexOf(word)
    return [i, i + word.length]
  }
  return {
    text,
    truncated: false,
    inputLength: TRY_MEMO.length,
    warnings: [],
    notes: [],
    highlights: [[head.length, text.length]],
    masking: {
      mode: 'restore',
      items: [
        {
          key: 'ip:10.0.3.15',
          category: 'ip',
          original: '10.0.3.15',
          replacement: 'IP_1',
          count: 1,
          enabled: true
        },
        {
          key: 'path:c:\\가상자동차\\시험결과',
          category: 'path',
          original: 'C:\\가상자동차\\시험결과',
          replacement: 'PATH_1',
          count: 1,
          enabled: true
        }
      ]
    },
    maskRanges: [at('IP_1'), at('PATH_1')]
  }
}

/** 확인 화면 장면: 팔레트 창(720×460, SCENE_W=720 SCENE_H=460으로 찍는다)에 회의록 정리의 확인 화면 */
function confirmScene(
  id: string,
  title: string,
  o: { maskingTip: boolean; masking?: MaskingMode; keys?: string[] }
): Scene {
  return {
    id,
    title,
    fixtures: {
      status: {
        paletteHotkey: 'Ctrl+Alt+Space',
        maskingMode: o.masking ?? 'restore',
        aiTargetName: 'Claude'
      },
      items: PALETTE_ITEMS,
      preview: tryPreview(),
      shown: {
        mode: 'confirm',
        draft: {
          templateId: 'meeting-notes',
          name: '회의록 정리',
          group: '회의',
          selection: { length: TRY_MEMO.length },
          clipboardLength: 0,
          defaultSource: 'selection',
          targets: allAiTargets([]).map((t) => ({ id: t.id, name: t.name })),
          target: 'claude',
          masking: o.masking ?? 'restore',
          maskingTip: o.maskingTip
        }
      }
    },
    render: () => <ConfirmStage keys={o.keys} />
  }
}

/** 팔레트 창에 확인 화면을 띄우고, keys가 있으면 그린 뒤 화면에 키를 보낸다(사람이 Tab을 누른 것처럼) */
function ConfirmStage({ keys = [] }: { keys?: string[] }): React.JSX.Element {
  useEffect(() => {
    const timers = keys.map((code, i) =>
      setTimeout(
        () =>
          document.activeElement?.dispatchEvent(
            new KeyboardEvent('keydown', { key: code, code, bubbles: true, cancelable: true })
          ),
        600 + i * 150
      )
    )
    return () => timers.forEach(clearTimeout)
  }, [keys])
  return (
    <div
      style={{
        width: 720,
        height: 460,
        background: 'linear-gradient(135deg, #22355E 0%, #3B4F86 55%, #6A5B9A 100%)'
      }}
    >
      <Palette />
    </div>
  )
}

const CONFIRM_SCENES: Scene[] = [
  confirmScene('confirm-tip', '확인 화면: 가명 처리 첫 안내(바꾸고 되돌리기, 처음 한 번)', {
    maskingTip: true
  }),
  confirmScene(
    'confirm-tip-focused',
    '확인 화면: 가명 처리 첫 안내에 Tab으로 초점(Enter·Space로 닫기)',
    { maskingTip: true, keys: ['Tab', 'Tab'] }
  ),
  confirmScene('confirm-tip-remove', '확인 화면: 가명 처리 첫 안내(바꾸기만)', {
    maskingTip: true,
    masking: 'remove'
  }),
  confirmScene('confirm-seen', '확인 화면: 안내를 이미 봄(미리 보기 그대로)', { maskingTip: false })
]

export const SCENES: Scene[] = [
  {
    id: 'status-bar',
    title: '팔레트 아래 상태 줄(가명 처리 끔)',
    fixtures: { status: { paletteHotkey: 'Alt+`', maskingMode: 'off', aiTargetName: 'Claude' } },
    render: () => (
      <Desktop edge="left">
        <div style={{ width: 600, marginLeft: 20, background: 'var(--surface-palette-solid)', borderRadius: 8 }}>
          <StatusBar refreshKey={0} />
        </div>
      </Desktop>
    )
  },
  ...PALETTE_SCENES,
  single('bar-edge-right', '바: 가장자리 띠, 오른쪽(기본)', { shape: 'edge', edge: 'right' }),
  single('bar-edge-left', '바: 가장자리 띠, 왼쪽', { shape: 'edge', edge: 'left' }),
  single('bar-capsule-right', '바: 떠 있는 캡슐, 오른쪽(가장자리에서 12)', { shape: 'capsule', edge: 'right' }),
  single('bar-capsule-left', '바: 떠 있는 캡슐, 왼쪽', { shape: 'capsule', edge: 'left' }),
  pair('bar-masking-off', '바: 가명 처리 끔(끊긴 방패·주황 점·"끔"), 띠와 캡슐', { masking: 'off' }),
  pair('bar-pet-hidden', '바: 말랑 메이트 숨김(흐린 아이콘·사선), 띠와 캡슐', { petVisible: false }),
  pair('bar-busy', '바: 고정 프롬프트 실행 중(흐린 맥박), 띠와 캡슐', { busyItem: 'prompt:req-to-testcase' }),
  pair('bar-collapsed', '바: 자동 숨김으로 들어감(6 DIP 손잡이), 오른쪽 띠·왼쪽 캡슐', { collapsed: true }, <AppWindow side="left" under />),
  pair('bar-five-prompts', '바: 고정 프롬프트 5개(아이콘 3·글자 칸 2), 띠와 캡슐', { pinned: FIVE_PINNED }),
  pair(
    'bar-opacity-low',
    '바: 불투명도 0.6을 흰 문서 창 위에(가명 처리 끔, 펫 숨김), 대비 점검용',
    { opacity: 0.6, masking: 'off', petVisible: false },
    <>
      <AppWindow side="left" under />
      <AppWindow side="right" under />
    </>
  ),
  flyoutScene('flyout-label', '펼침 창: 로고 이름표(단축키는 키 모양)', EDGE_RIGHT, { itemId: 'logo' }, { kind: 'label', text: labelOf(EDGE_RIGHT, 'logo') }),
  flyoutScene(
    'flyout-label-long',
    '펼침 창: 사용자가 만든 긴 프롬프트 이름표(최대 너비 240에서 보조 글이 통째로 다음 줄로)',
    EDGE_RIGHT,
    { itemId: 'prompt:static-analysis' },
    { kind: 'label', text: '가상자동차 요구사항 추적표 정리와 누락 항목 확인 · 선택한 글로 실행' }
  ),
  flyoutScene('flyout-masking', '펼침 창: 가명 처리 기본값 메뉴(가명 후 되돌리기)', EDGE_RIGHT, { itemId: 'masking' }, { kind: 'masking-menu', mode: 'restore' }),
  flyoutScene('flyout-masking-off', '펼침 창: 가명 처리 기본값 메뉴(끔 — 글과 주황으로)', EDGE_RIGHT_OFF, { itemId: 'masking' }, { kind: 'masking-menu', mode: 'off' }),
  flyoutScene('flyout-workspaces', '펼침 창: 워크스페이스(저장한 배치 3개, 하나는 다른 모니터 구성)', EDGE_RIGHT, { itemId: 'workspace' }, WS_MENU),
  flyoutScene('flyout-workspaces-empty', '펼침 창: 워크스페이스(저장한 배치 없음)', EDGE_RIGHT, { itemId: 'workspace' }, { kind: 'workspace-menu', workspaces: [], canSave: true, more: 0 }),
  flyoutScene('flyout-workspaces-blocked', '펼침 창: 워크스페이스(보안 프로그램이 막아 저장 행을 쓸 수 없음)', EDGE_RIGHT, { itemId: 'workspace' }, { ...WS_MENU, canSave: false }),
  flyoutScene('flyout-workspaces-more', '펼침 창: 워크스페이스(8개 + 외 3개 더, 긴 이름은 한 줄로 줄임)', EDGE_RIGHT, { itemId: 'workspace' }, WS_MENU_MORE),
  flyoutScene(
    'flyout-workspaces-more-blocked',
    '펼침 창: 워크스페이스(저장할 수 없어 저장 행이 두 줄, 카드 높이에 맞춰 7개 + 외 4개 더)',
    EDGE_RIGHT,
    { itemId: 'workspace' },
    WS_MENU_MORE_BLOCKED
  ),
  flyoutScene('flyout-bar-menu', '펼침 창: 바 메뉴(오른쪽 클릭, 가장자리 띠)', EDGE_RIGHT, { clickY: 250 }, { kind: 'bar-menu', shape: 'edge' }),
  flyoutScene('flyout-bar-menu-left', '펼침 창: 바 메뉴, 왼쪽 떠 있는 캡슐', CAPSULE_LEFT, { clickY: 240 }, { kind: 'bar-menu', shape: 'capsule' }),
  ...CARD_SCENES,
  ...PET_SCENES,
  ...REACTION_SCENES,
  ...MENU_SCENES,
  settingsScene('settings-general', '설정: 일반', 'general'),
  settingsScene('settings-ai', '설정: AI 대상(사내 LLM 하나 더함)', 'ai'),
  settingsScene('settings-bar', '설정: 바', 'bar'),
  settingsScene('settings-masking', '설정: 가명 처리(가상 사전 두 개)', 'masking'),
  settingsScene('settings-prompts', '설정: 프롬프트·상용구 목록', 'prompts'),
  settingsScene('settings-glossary', '설정: 용어 사전(기본 팩)', 'glossary'),
  settingsScene('settings-hotkeys', '설정: 단축키', 'hotkeys'),
  settingsScene('settings-pet', '설정: 말랑 메이트(기본값, 조종 단축키 없음)', 'pet'),
  settingsScene('settings-pet-set', '설정: 말랑 메이트(숨김·크게·차분·졸기 15분·움직임 줄이기, 조종 단축키 Ctrl+Alt+P)', 'pet', petSet),
  settingsScene('settings-pet-set-end', '설정: 말랑 메이트 아래쪽(말풍선 끔, 조종 단축키 Ctrl+Alt+P 쓰는 중)', 'pet', petSet, { scrollEnd: true }),
  settingsScene(
    'settings-pet-taken',
    '설정: 말랑 메이트 아래쪽(조종 단축키를 다른 앱이 써서 등록 못 함)',
    'pet',
    (s) => {
      s.settings.pet = { ...s.settings.pet, size: 40, controlHotkey: 'Ctrl+Alt+M' }
      s.hotkeys['pet-control'] = { acc: 'Ctrl+Alt+M', registered: false }
    },
    { scrollEnd: true }
  ),
  settingsScene('settings-pet-recording', '설정: 말랑 메이트 아래쪽(조종 단축키 정하기를 눌러 녹화 중)', 'pet', undefined, { scrollEnd: true, click: '조종 단축키 정하기' }),
  settingsScene(
    'settings-pet-narrow',
    '설정: 말랑 메이트 아래쪽, 가장 좁은 창 720×520(조종 단축키 등록 못 함)',
    'pet',
    (s) => {
      s.settings.pet = { ...s.settings.pet, controlHotkey: 'Ctrl+Alt+M' }
      s.hotkeys['pet-control'] = { acc: 'Ctrl+Alt+M', registered: false }
    },
    { scrollEnd: true, width: 720, height: 520 }
  ),
  ...WORKSPACE_SCENES,
  ...NATURAL_SCENES,
  ...ONBOARDING_SCENES,
  ...TRY_SCENES,
  ...CONFIRM_SCENES
]


/** 설정 창 미리 보기용 상태(가상 값만: example.com 주소, 가상 모니터 이름) */
function settingsSnapshot(): SettingsSnapshot {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.ai.custom = [{ id: 'custom-llm', name: '사내 LLM', url: 'https://llm.example.com' }]
  return {
    settings,
    aiTargets: allAiTargets(settings.ai.custom),
    hotkeys: { palette: { acc: 'Ctrl+Alt+Space', registered: true }, lookup: { acc: 'Ctrl+Alt+W', registered: true }, 'pet-control': { acc: null, registered: false } },
    displays: [
      { id: '1', label: '내장 모니터 · 1536×864', primary: true },
      { id: '2', label: '외부 모니터 · 2560×1440', primary: false }
    ],
    prompts: TEMPLATES.map((t) => ({ id: t.id, name: t.name })),
    packaged: false
  }
}

/** 말랑 메이트 탭 미리 보기: 기본값을 모두 바꾼 상태(숨김, 크게, 차분, 졸기 15분, 말풍선 끔, 움직임 줄이기, 조종 단축키 있음) */
function petSet(s: SettingsSnapshot): void {
  s.settings.pet = { ...s.settings.pet, visible: false, size: 72, activity: 'calm', sleepAfterMin: 15, bubbles: false, reduceMotion: true, controlHotkey: 'Ctrl+Alt+P' }
  s.hotkeys['pet-control'] = { acc: 'Ctrl+Alt+P', registered: true }
}

/**
 * 미리 보기 준비: 설정을 읽어 그린 뒤 이름이 click으로 시작하는 단추를 누르고(녹화 칸 보기), 내용 칸을 끝까지 내린다
 * (880×640 창에서 아래쪽 구역 보기). 캡처는 가상 시간 3초 시점이라 매번 같다
 */
function ScenePrep({ scrollEnd, click, blur, top, hover, scrollTo, pressText }: ScenePrepOptions): null {
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(
      setTimeout(() => {
        // 처음 포커스(워크스페이스 탭이 골라 둔 이름 칸)를 풀어 기본 모습을 찍는다
        if (blur && document.activeElement instanceof HTMLElement) document.activeElement.blur()
        // 이름 칸으로 포커스가 가며 내려간 내용 칸을 맨 위로
        if (top) document.getElementById('settings-panel')?.scrollTo({ top: 0 })
        if (hover) {
          // 캡처 창은 포커스가 없어 focus 이벤트가 오지 않으므로, 마우스를 올린 것처럼 알리고 그 요소가 보이게 내린다
          const el = document.querySelector<HTMLElement>(hover)
          el?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null }))
          // 설정 내용 칸만 내린다(scrollIntoView는 미리 보기 페이지까지 내려 캡처 아래가 빈다)
          const panel = document.getElementById('settings-panel')
          if (el && panel) {
            const offset = el.getBoundingClientRect().top - panel.getBoundingClientRect().top
            panel.scrollTop += offset - panel.clientHeight / 2 + el.clientHeight / 2
          }
        }
        if (scrollTo) {
          // 그 요소가 내용 칸 위쪽에 오게 내용 칸만 내린다(구역 머리글까지 보이게 조금 덜 내린다)
          const el = document.querySelector<HTMLElement>(scrollTo)
          const panel = document.getElementById('settings-panel')
          if (el && panel) panel.scrollTop += el.getBoundingClientRect().top - panel.getBoundingClientRect().top - 96
        }
        if (click) document.querySelector<HTMLButtonElement>(`button[aria-label^="${click}"]`)?.click()
        // 이름표(aria-label)가 없는 단추는 보이는 글로 찾아 누른다(모두 지우기 확인 기다림 보기)
        if (pressText) [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(pressText))?.click()
        if (scrollEnd) timers.push(setTimeout(() => document.getElementById('settings-panel')?.scrollTo({ top: 100000 }), 100))
      }, 300)
    )
    return () => timers.forEach(clearTimeout)
  }, [scrollEnd, click, blur, top, hover, scrollTo, pressText])
  return null
}

type ScenePrepOptions = {
  scrollEnd?: boolean
  click?: string
  /** 처음 포커스를 푼다 */
  blur?: boolean
  /** 내용 칸을 맨 위로 올린다 */
  top?: boolean
  /** 이 요소(선택자)에 마우스를 올린 것처럼 알리고 가운데로 내린다(워크스페이스 탭: 그 줄을 고르면 그림이 그 창을 강조) */
  hover?: string
  /** 이 요소(선택자)가 내용 칸 위쪽에 오게 내린다 */
  scrollTo?: string
  /** 보이는 글에 이 말이 든 첫 단추를 누른다 */
  pressText?: string
}

/**
 * 설정 창 장면: 880×640 창 하나(제목 줄 오른쪽 140은 Windows 창 단추 자리). tweak으로 미리 보기 상태를 바꾸고,
 * prep의 width·height로 창 크기를 바꾼다(최소 720×520 확인: SCENE_W=720 SCENE_H=520으로 찍는다)
 */
function settingsScene(
  id: string,
  title: string,
  tab: SettingsTabId,
  tweak?: (s: SettingsSnapshot) => void,
  prep?: ScenePrepOptions & { width?: number; height?: number }
): Scene {
  const snapshot = settingsSnapshot()
  tweak?.(snapshot)
  return {
    id,
    title,
    fixtures: {
      settings: snapshot,
      dictionary: [
        { id: 'v1', category: 'client', canonical: '가상자동차', aliases: ['가상차'] },
        { id: 'v2', category: 'project', canonical: 'XY방산 시험장비', aliases: [] }
      ],
      templates: PREVIEW_TEMPLATES,
      glossary: PACK.slice(0, 12)
    },
    render: () => (
      <div style={{ width: prep?.width ?? 880, height: prep?.height ?? 640, overflow: 'hidden', position: 'relative' }}>
        <SettingsApp initialTab={tab} />
        {prep ? <ScenePrep {...prep} /> : null}
      </div>
    )
  }
}
