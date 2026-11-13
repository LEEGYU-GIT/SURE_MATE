import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PetActivity, PetSize } from '../../../shared/pet/pet-settings'
import type { PetLook } from '../../../shared/pet/pet-view'
import { PetSprite } from '../pet/PetSprite'
import { walkMs, walkTrack } from './mate-walk'
import { MiniBubble } from './parts'

/** 인사 말풍선이 떠 있는 시간(설계 §14-2 말풍선 4초). 그동안은 서서 인사하고, 끝나면 걷기 시작한다 */
const GREET_MS = 4000
/** 걸음 사이에 멈춰 쉬는 시간 */
const REST_MS = 1600
/** 64 격자의 바닥선(y=58) 아래 여백. 발이 바닥 선에 닿게 그만큼 내린다(설정 말랑 메이트 탭의 크기 미리 보기와 같다) */
const BELOW_FEET = 6 / 64

/**
 * 준비 완료 화면의 말랑 메이트 무대(설계 §14-2): 작업 표시줄 윗선과 오른쪽의 작은 Sure-Mate 바, 그 위를 걷는 펫.
 * 처음 4초는 서서 폴짝 인사하고(말풍선), 그 뒤로 바 앞까지 걷고 쉬고 돌아오기를 되풀이한다(속도는 설정의 활발함).
 * 움직임 줄이기면 걷지도 뛰지도 않고 서 있다. hidden(펫 보이기 끔)이면 흐리게 서 있다.
 * 그림은 꾸밈이라 화면 읽기 프로그램에는 감춘다(옆 글이 같은 내용을 말한다)
 */
export function MateStage({
  size,
  activity,
  sunglasses,
  reduceMotion,
  hidden,
  greeting
}: {
  size: PetSize
  activity: PetActivity
  /** 가명 처리가 켜져 있으면 선글라스(설계 §14-2) */
  sunglasses: boolean
  reduceMotion: boolean
  hidden: boolean
  greeting: string
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = (): void => setWidth(Math.round(el.getBoundingClientRect().width))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const track = walkTrack({ width, size })
  /** 인사는 길 가운데에서 한다 */
  const middle = Math.round((track.from + track.to) / 2)
  const [greeting4s, setGreeting4s] = useState(true)
  /** x: 펫 왼쪽 끝(null이면 길 시작). 걸음 하나를 시작할 때 목표 자리로 바꾸고 그동안 moving */
  const [walk, setWalk] = useState<{
    x: number | null
    facing: 'left' | 'right'
    moving: boolean
    ms: number
  }>({ x: null, facing: 'right', moving: false, ms: 0 })
  /** 마지막 걸음의 목표 자리(효과 안에서만 읽는다). 걷다 멈추면 그 자리로 옮겨 그린다 */
  const lastTarget = useRef<number | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setGreeting4s(false), GREET_MS)
    return () => clearTimeout(t)
  }, [])

  const still = reduceMotion || hidden
  useEffect(() => {
    if (still || greeting4s || track.to <= track.from) return
    let timer: ReturnType<typeof setTimeout>
    let pos = lastTarget.current ?? middle
    // 먼 쪽 끝으로 걷고, 쉬고, 돌아선다
    let right = pos < (track.from + track.to) / 2
    const step = (): void => {
      const to = right ? track.to : track.from
      const ms = walkMs(to - pos, activity)
      lastTarget.current = to
      setWalk({ x: to, facing: right ? 'right' : 'left', moving: true, ms })
      timer = setTimeout(() => {
        pos = to
        right = !right
        setWalk((w) => ({ ...w, moving: false }))
        timer = setTimeout(step, REST_MS)
      }, ms)
    }
    timer = setTimeout(step, 0)
    // 멈추면(움직임 줄이기·숨김) 그리는 쪽이 선 자세로 바꾼다(still)
    return () => clearTimeout(timer)
  }, [still, greeting4s, track.from, track.to, middle, activity])

  const look: PetLook = {
    pose: walk.moving && !still ? 'walk' : 'stand',
    face: greeting4s ? 'happy' : 'normal',
    props: sunglasses ? ['sunglasses'] : [],
    facing: walk.facing,
    // 화면이 열리면 한 번 폴짝(인사). cueSeq를 바꾸지 않으니 다시 뛰지 않는다
    cue: still ? null : 'hop',
    cueSeq: 1
  }
  const x = walk.x ?? middle
  return (
    <div ref={box} aria-hidden="true" className="relative h-24 w-full">
      {/* 작업 표시줄 윗선 */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-line" />
      {/* 작은 Sure-Mate 바(가장자리 띠): 로고 점은 청록 */}
      <div className="absolute right-0 bottom-0 flex h-14 w-3 flex-col items-center gap-1 rounded-t-full border border-b-0 border-line bg-surface-bar pt-1.5">
        <span className="size-1.5 rounded-full bg-brand" />
        <span className="size-1.5 rounded-full bg-fg-3/60" />
        <span className="size-1.5 rounded-full bg-fg-3/60" />
      </div>
      <div
        className={`guide-walk absolute bottom-0 left-0 ${hidden ? 'opacity-40' : ''}`}
        style={{
          transform: `translateX(${x}px)`,
          transitionDuration: `${walk.moving && !still ? walk.ms : 0}ms`,
          marginBottom: -Math.round(size * BELOW_FEET)
        }}
      >
        {greeting4s ? (
          <div className="guide-reveal absolute bottom-full left-1/2 mb-1 -translate-x-1/2">
            <MiniBubble>{greeting}</MiniBubble>
          </div>
        ) : null}
        <PetSprite look={look} size={size} reduceMotion={still} />
      </div>
    </div>
  )
}
