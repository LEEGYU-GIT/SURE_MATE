import { buildBarItems, type BarViewState } from '../../../shared/bar/bar-items'
import { barRect, barSize, DEFAULT_BAR_RATIO, handleRect } from '../../../shared/bar/bar-layout'
import type { MaskingMode, Rect } from '../../../shared/types'
import { Bar, BarView } from '../bar/Bar'
import { StatusBar } from '../palette/StatusBar'
import { Desktop } from './Desktop'
import type { FakeFixtures } from './fake-api'

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
      paletteHotkey: 'Alt+`'
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
  )
]
