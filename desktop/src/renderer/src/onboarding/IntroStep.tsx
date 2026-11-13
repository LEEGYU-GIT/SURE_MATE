import type { ReactNode } from 'react'
import type { PetLook } from '../../../shared/pet/pet-view'
import { ArrowRightIcon } from '../design/icons'
import { PetSprite } from '../pet/PetSprite'
import { MiniBubble, StepTitle } from './parts'

/**
 * 첫 실행 안내 1 / 3: 소개(2026-11-12 사용자 요청: 설치하고 첫 화면에서 "오 이거 좋다! 자주 쓰겠는데?"). 기능 이름 대신 실제 업무 순간
 * 네 가지를 앱의 실제 조각으로 만든 작은 그림과 함께 한눈에 보인다. 핵심 기능인 워크스페이스(화면 감추기 포함)는 한 줄을 다 쓰는
 * 큰 칸이고, 프롬프트·가명 처리, 용어 위키·상용구, 말랑 메이트는 그 아래 세 칸이다.
 * 움직이는 것은 말랑 메이트의 숨쉬기 하나뿐이다(움직임 줄이기면 멈춘다)
 */
export function IntroStep({ reduceMotion }: { reduceMotion: boolean }): React.JSX.Element {
  return (
    <>
      <StepTitle title="매일 하던 잔일, 단축키 한 번이면 끝나요">
        어느 창에서 일하든 단축키 하나로 불러 쓰는 업무 도우미예요.
      </StepTitle>
      <ul className="grid grid-cols-1 gap-3 @min-[600px]:grid-cols-3">
        <li className="grid grid-cols-1 items-center gap-x-5 gap-y-3 rounded-window bg-surface-inset p-4 @min-[600px]:col-span-3 @min-[600px]:grid-cols-[288px_minmax(0,1fr)]">
          <div aria-hidden="true" className="flex h-16 items-center">
            <WorkspacePicture />
          </div>
          <div className="min-w-0">
            <p className="text-body leading-5 font-semibold text-fg">
              흩어진 창, 단축키 한 번에 제자리로
            </p>
            <p className="mt-1 text-small leading-5 text-pretty break-keep text-fg-2">
              일하던 창 배치를 저장해 두면 그대로 돌아와요. 누가 뒤로 지나갈 땐 ‘화면 감추기’로 업무
              창만 남겨요.
            </p>
          </div>
        </li>
        <Tile title="회의록을 AI에 맡길 때" picture={<MaskPicture />}>
          적어 둔 고객사 이름과 IP는 임시 이름으로 바꿔 보내요.
        </Tile>
        <Tile title="모르는 약어가 나왔을 때" picture={<WikiPicture />}>
          선택하고 단축키를 누르면 뜻이 떠요. 자주 쓰는 문장도 바로 붙여넣어요.
        </Tile>
        <Tile title="곁을 지키는 말랑 메이트" picture={<MatePicture reduceMotion={reduceMotion} />}>
          바 근처를 걷다가 복사하면 폴짝 뛰며 알려 줘요.
        </Tile>
      </ul>
    </>
  )
}

/** 업무 순간 하나: 그림(꾸밈, 화면 읽기 프로그램에는 감춘다) + 순간(14/600) + 얻는 것(13) */
function Tile({
  title,
  picture,
  children
}: {
  title: string
  picture: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <li className="flex min-w-0 flex-col rounded-window bg-surface-inset p-3">
      <div aria-hidden="true" className="flex h-16 items-center justify-center overflow-hidden">
        {picture}
      </div>
      <p className="mt-2 text-body leading-5 font-semibold break-keep text-fg">{title}</p>
      <p className="mt-1 text-small leading-5 text-pretty break-keep text-fg-2">{children}</p>
    </li>
  )
}

type Box = { x: number; y: number; w: number; h: number }

/** 모니터 그림 위 창 하나(설정 창 워크스페이스 탭의 모니터 그림과 같은 모양: 옅은 칠, 테두리, 위쪽 3 DIP 띠) */
function MiniWindow({
  b,
  color,
  strong
}: {
  b: Box
  color: string
  strong: boolean
}): React.JSX.Element {
  return (
    <g>
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        fill={color}
        fillOpacity={strong ? 0.26 : 0.2}
        stroke={color}
        strokeOpacity={0.9}
        strokeWidth={strong ? 1.5 : 1}
      />
      <rect x={b.x} y={b.y} width={b.w} height={3} fill={color} fillOpacity={strong ? 0.9 : 0.55} />
    </g>
  )
}

function MiniMonitor({
  x,
  windows,
  strong
}: {
  x: number
  windows: Box[]
  strong: boolean
}): React.JSX.Element {
  const color = strong ? 'var(--brand)' : 'var(--text-3)'
  return (
    <g>
      <rect
        x={x + 0.5}
        y={4.5}
        width={103}
        height={55}
        rx={4}
        fill="var(--surface-palette-solid)"
        stroke="var(--line)"
      />
      <rect x={x + 1} y={53} width={102} height={6} fill="var(--line)" />
      {windows.map((b, i) => (
        <MiniWindow key={i} b={b} color={color} strong={strong} />
      ))}
    </g>
  )
}

/** 흩어진 창 → (단축키) → 저장한 자리로 돌아온 창 */
function WorkspacePicture(): React.JSX.Element {
  const messy: Box[] = [
    { x: 10, y: 14, w: 40, h: 26 },
    { x: 33, y: 24, w: 46, h: 24 },
    { x: 66, y: 10, w: 30, h: 22 }
  ]
  const tidy: Box[] = [
    { x: 190, y: 10, w: 50, h: 40 },
    { x: 244, y: 10, w: 38, h: 19 },
    { x: 244, y: 31, w: 38, h: 19 }
  ]
  return (
    <svg
      viewBox="0 0 288 64"
      width="100%"
      height="64"
      preserveAspectRatio="xMidYMid meet"
      className="block max-w-72"
    >
      <MiniMonitor x={0} windows={messy} strong={false} />
      <rect
        x={112.5}
        y={10.5}
        width={63}
        height={23}
        rx={4}
        fill="var(--surface-palette-solid)"
        stroke="var(--line)"
      />
      <text
        x={144}
        y={26}
        textAnchor="middle"
        fontSize={12}
        fill="var(--text-1)"
        style={{ fontFamily: 'var(--font-ui)' }}
      >
        Ctrl+Alt+1
      </text>
      <path
        d="M118 45 H170 M164 40 L170 45 L164 50"
        fill="none"
        stroke="var(--text-3)"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <MiniMonitor x={184} windows={tidy} strong />
    </svg>
  )
}

/** 보낼 글의 고객사 이름이 확인 화면처럼 청록 임시 이름(CLIENT_A)으로 바뀌어 AI에 간다 */
function MaskPicture(): React.JSX.Element {
  const chip =
    'rounded-control border border-line bg-surface-solid px-1.5 text-caption leading-6 font-semibold whitespace-nowrap'
  return (
    <div className="flex items-center gap-1.5">
      <span className={`${chip} text-fg`}>가상자동차</span>
      <ArrowRightIcon size={14} className="shrink-0 text-fg-3" />
      <span className={`${chip} text-brand`}>CLIENT_A</span>
    </div>
  )
}

/** 형광펜으로 칠한(선택한) 약어 아래에 뜬 위키 카드 */
function WikiPicture(): React.JSX.Element {
  return (
    <div className="relative h-16 w-44">
      <span className="absolute top-0.5 left-1 rounded-control bg-highlight px-1 text-caption leading-5 font-semibold text-ink">
        MC/DC
      </span>
      <div className="absolute top-5 left-6 rounded-window border border-line bg-surface-flyout px-2 py-1">
        <p className="text-caption leading-4 font-semibold whitespace-nowrap text-fg">MC/DC</p>
        <p className="text-caption leading-4 whitespace-nowrap text-fg-2">
          변경 조건/결정 커버리지
        </p>
      </div>
    </div>
  )
}

/** 복사 축하(편지를 든 기쁜 얼굴, 설계 §14-2)하는 말랑 메이트와 말풍선, 옆의 작은 바 */
const CHEER: PetLook = {
  pose: 'stand',
  face: 'happy',
  props: ['envelope'],
  facing: 'left',
  cue: null,
  cueSeq: 0
}

function MatePicture({ reduceMotion }: { reduceMotion: boolean }): React.JSX.Element {
  return (
    <div className="relative flex h-14 w-44 items-end justify-center gap-1.5">
      <div className="absolute inset-x-2 bottom-0 h-px bg-line" />
      <div className="mb-6">
        <MiniBubble tail="right">복사했어요!</MiniBubble>
      </div>
      <div className="relative -mb-1">
        <PetSprite look={CHEER} size={40} reduceMotion={reduceMotion} />
      </div>
      <div className="ml-3 flex h-11 w-2.5 flex-col items-center gap-1 rounded-t-full border border-b-0 border-line bg-surface-bar pt-1.5">
        <span className="size-1 rounded-full bg-brand" />
        <span className="size-1 rounded-full bg-fg-3/60" />
        <span className="size-1 rounded-full bg-fg-3/60" />
      </div>
    </div>
  )
}
