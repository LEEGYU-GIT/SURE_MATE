import { useEffect, useState } from 'react'
import builtinGlossary from '../../../../resources/glossary.json'
import { edgeCardRect, flyoutCardRect, flyoutWindowRect } from '../../../main/flyout/flyout-placement'
import { buildBarItems, type BarViewState } from '../../../shared/bar/bar-items'
import { barRect, barSize, DEFAULT_BAR_RATIO, handleRect, itemOffsets } from '../../../shared/bar/bar-layout'
import type { BarEdge } from '../../../shared/bar/bar-settings'
import type { FlyoutContent, FlyoutMessage, FlyoutPad, WikiCardView } from '../../../shared/flyout/flyout-content'
import { parseGlossaryPack } from '../../../shared/glossary/pack'
import type { GlossaryEntry } from '../../../shared/glossary/types'
import { buildGlossaryIndex, toCardEntry, wikiCardView } from '../../../shared/glossary/wiki-lookup'
import type { AppEvent } from '../../../shared/app-events'
import { CAPTURE_NOTES } from '../../../shared/labels'
import type { MaskCategory } from '../../../shared/masking/types'
import { bubbleSlot, hopRoom, petBox, petWindowRect } from '../../../shared/pet/pet-frame'
import { reactionFor } from '../../../shared/pet/pet-reactions'
import type { PetSize } from '../../../shared/pet/pet-settings'
import type { PetFace, PetLook, PetPose, PetView } from '../../../shared/pet/pet-view'
import { petWorld, type PetWorld } from '../../../shared/pet/pet-world'
import type { MaskingMode, MonitorInfo, Rect } from '../../../shared/types'
import { Bar, BarView } from '../bar/Bar'
import { Flyout } from '../flyout/Flyout'
import { StatusBar } from '../palette/StatusBar'
import { Pet } from '../pet/Pet'
import { PetSprite } from '../pet/PetSprite'
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
}

/** 상태 기계(react)와 같이 반응의 표정·소품·cue로 모습을 덮어쓰고 말풍선 자리를 계산한다 */
function reactionView(o: PetSceneOptions, box: Rect, win: Rect, size: PetSize): Pick<PetView, 'look' | 'bubble'> {
  const r = o.react ? reactionFor(o.react.event, { reactions: true, bubbles: true }) : null
  if (!o.react || !r) return { look: petLook(o.look), bubble: null }
  const look = petLook({ ...o.look, face: r.face, props: [...(o.react.sunglasses ? (['sunglasses'] as const) : []), ...r.props], cue: r.cue, cueSeq: r.cue ? 1 : 0 })
  if (!r.bubble) return { look, bubble: null }
  const s = bubbleSlot({ box, window: win, bounds: MONITOR.bounds, hop: hopRoom(size) })
  return { look, bubble: { seq: 1, text: r.bubble, side: s.side, slot: { x: s.rect.x - win.x, y: s.rect.y - win.y, width: s.rect.width, height: s.rect.height } } }
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
    ...reactionView(o, box, win, size),
    menu: null,
    controlling: false,
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
  flyoutScene('flyout-workspaces', '펼침 창: 워크스페이스(빈 목록, 저장은 준비 중)', EDGE_RIGHT, { itemId: 'workspace' }, { kind: 'workspace-menu', workspaces: [], canSave: false }),
  flyoutScene('flyout-bar-menu', '펼침 창: 바 메뉴(오른쪽 클릭, 가장자리 띠)', EDGE_RIGHT, { clickY: 250 }, { kind: 'bar-menu', shape: 'edge' }),
  flyoutScene('flyout-bar-menu-left', '펼침 창: 바 메뉴, 왼쪽 떠 있는 캡슐', CAPSULE_LEFT, { clickY: 240 }, { kind: 'bar-menu', shape: 'capsule' }),
  ...CARD_SCENES,
  ...PET_SCENES,
  ...REACTION_SCENES
]
