import { Component, createRef, useState, type ReactNode } from 'react'
import type { PetSize } from '../../../shared/pet/pet-settings'
import type { PetLook, PetProp } from '../../../shared/pet/pet-view'
import { MALLANG, type PetCharacter } from './character'
import { drawPlan, FACE_PARTS, type DrawPlan, type EyesKind, type FaceParts, type MouthKind } from './draw-plan'
import { FACE_CENTER, FACE_SHAPES, PROP_SHAPES, STROKE, type FacePlace } from './mallang-shapes'
import './pet.css'

/** 왼쪽을 볼 때 캐릭터(몸·얼굴)를 x=32 기준으로 뒤집는다. 소품은 뒤집지 않는다(z 글자가 거꾸로 되지 않게) */
const MIRROR = 'matrix(-1 0 0 1 64 0)'

/**
 * 걷다 멈추거나(몸이 공중에 있음) 들렸다 놓이면(몸이 기울어 있음) 반복 움직임이 끝나는 순간 몸이 한 프레임에 제자리로 튄다.
 * Chromium은 애니메이션 클래스를 떼어도 그 값에서 전환을 시작하지 않으므로, 바뀌기 직전 모양을 읽어 제자리로 내려앉힌다.
 * 떨어지는 곡선(점점 빨라짐), 160ms. 숨쉬기는 변화가 작아 그대로 바꾼다.
 */
const SETTLE = { ms: 160, easing: 'cubic-bezier(0.33, 0, 0.67, 0.33)', from: ['pet-walk', 'pet-sway'] } as const

interface LoopGroupProps {
  /** 늘 붙는 클래스(기준점) */
  base: string
  /** 반복 움직임 클래스(없으면 '') */
  loop: string
  still: boolean
  children: ReactNode
}

class LoopGroup extends Component<LoopGroupProps> {
  private readonly ref = createRef<SVGGElement>()

  getSnapshotBeforeUpdate(prev: LoopGroupProps): string | null {
    const el = this.ref.current
    if (!el || this.props.still || prev.loop === this.props.loop) return null
    if (!(SETTLE.from as readonly string[]).includes(prev.loop)) return null
    // 아직 이전 클래스로 그려져 있다: 지금 움직이는 값(공중 높이·기울기)
    const now = getComputedStyle(el).transform
    return now && now !== 'none' ? now : null
  }

  componentDidUpdate(_prev: LoopGroupProps, _state: unknown, from: string | null): void {
    const el = this.ref.current
    if (from && el && typeof el.animate === 'function') {
      el.animate([{ transform: from }, { transform: 'none' }], { duration: SETTLE.ms, easing: SETTLE.easing })
    }
  }

  render(): ReactNode {
    const { base, loop, children } = this.props
    return (
      <g ref={this.ref} className={loop ? `${base} ${loop}` : base}>
        {children}
      </g>
    )
  }
}

/**
 * 한 번 도는 움직임 그룹. cueSeq를 key로 새로 그려질 때의 cue만 쓰고, 그 뒤 cue가 바뀌어도(움직임 줄이기를 끄는 등)
 * 지난 폴짝·내려앉기를 다시 돌리지 않는다.
 */
function CueGroup({ base, cue, children }: { base: string; cue: string; children?: ReactNode }): React.JSX.Element {
  const [atMount] = useState(cue)
  return <g className={atMount ? `${base} ${atMount}` : base}>{children}</g>
}

export interface PetSpriteProps {
  look: PetLook
  size: PetSize
  reduceMotion: boolean
  /** 그림 교체 자리(§14-3). 기본은 말랑 메이트 */
  character?: PetCharacter
}

/**
 * 펫 한 마리(64 격자 SVG, 상자 크기 size). 레이어: 흔들림(들림) → 숨쉬기·걷기 → 한 번 도는 움직임(폴짝·내려앉기) → 몸·얼굴.
 * 소품은 몸 밖 레이어로 떠오르고, 폴짝 뛸 때는 몸과 함께 올라간다.
 * 상자 밖(머리 위 조종 표시·폴짝)도 보이게 overflow는 visible.
 */
export function PetSprite({ look, size, reduceMotion, character = MALLANG }: PetSpriteProps): React.JSX.Element {
  const plan = drawPlan(look, { reduceMotion })
  const Body = character.Body
  const swing = plan.motion === 'sway' ? 'pet-sway' : ''
  const loop = plan.motion === 'breathe' || plan.motion === 'walk' ? `pet-${plan.motion}` : ''
  const floating = plan.props.filter((p): p is FloatingProp => p !== 'sunglasses')
  // 반응 소품(편지·느낌표)은 자세마다 머리 가까이로 옮긴다(앉기·졸기의 퍼진 머리, 오르기의 벽 반대쪽)
  const near = character.props(plan.pose, plan.mirror)
  const nearHead = near.dx !== 0 || near.dy !== 0 ? `translate(${near.dx} ${near.dy})` : undefined
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      overflow="visible"
      className="pet-sprite"
      data-reduce-motion={reduceMotion ? '' : undefined}
      role="img"
      aria-label="말랑 메이트"
    >
      <g transform={plan.mirror ? MIRROR : undefined}>
        <LoopGroup base="pet-swing" loop={swing} still={reduceMotion}>
          <LoopGroup base="pet-motion" loop={loop} still={reduceMotion}>
            {/* cueSeq가 바뀌면 이 그룹만 다시 그려 한 번 도는 움직임을 처음부터 시작한다(반복 움직임은 이어 간다) */}
            <CueGroup key={look.cueSeq} base="pet-cue" cue={plan.cue ? `pet-${plan.cue}` : ''}>
              <Body pose={plan.pose} />
              <Face plan={plan} parts={FACE_PARTS[look.face]} place={character.face(plan.pose)} />
            </CueGroup>
          </LoopGroup>
        </LoopGroup>
      </g>
      {/*
        소품 층은 소품이 없어도 늘 그려 둔다: cueSeq가 바뀔 때만 다시 그려지므로, 나중에 나타난 소품(졸 때 z 등)이
        지난 폴짝을 다시 하지 않는다. 떠오르기는 떠 있는 소품이 있을 때만 돈다.
      */}
      <g className={plan.floatProps && floating.length > 0 ? 'pet-float' : undefined}>
        <CueGroup key={look.cueSeq} base="pet-lift" cue={plan.cue === 'hop' ? 'pet-hop-lift' : ''}>
          {floating.map((p) =>
            REACTION_PROPS.has(p) ? (
              <g key={p} transform={nearHead}>
                <Prop prop={p} />
              </g>
            ) : (
              <Prop key={p} prop={p} />
            )
          )}
        </CueGroup>
      </g>
    </svg>
  )
}

/** 얼굴 레이어: 서 있는 얼굴 좌표로 그리고 자세별 자리(FacePlace)로 옮긴다 */
function Face({ plan, parts, place }: { plan: DrawPlan; parts: FaceParts; place: FacePlace }): React.JSX.Element {
  const { x, y } = FACE_CENTER
  const moved = place.dx !== 0 || place.dy !== 0 || place.scale !== 1
  const hidden = plan.eyes === 'hidden'
  return (
    <g transform={moved ? `translate(${x + place.dx} ${y + place.dy}) scale(${place.scale}) translate(${-x} ${-y})` : undefined}>
      {plan.brows ? <path d={FACE_SHAPES.brows} fill="none" stroke="var(--ink)" strokeWidth={STROKE.faceThin} strokeLinecap="round" /> : null}
      {/* 선글라스를 쓰면 렌즈가 눈을 덮은 뒤 눈을 감춘다(pet.css). 벗으면 바로 보인다 */}
      <g className={plan.blink ? 'pet-eyes pet-blink' : 'pet-eyes'} data-hidden={hidden ? '' : undefined}>
        <Eyes kind={plan.eyes === 'hidden' ? parts.eyes : plan.eyes} />
      </g>
      <Mouth kind={plan.mouth} />
      {plan.cheeks ? <Cheeks /> : null}
      <Sunglasses on={plan.props.includes('sunglasses')} />
    </g>
  )
}

function Eyes({ kind }: { kind: EyesKind }): React.JSX.Element {
  const e = FACE_SHAPES.eyes
  switch (kind) {
    case 'dot':
      return (
        <>
          {e.dot.points.map(([cx, cy]) => (
            <ellipse key={cx} cx={cx} cy={cy} rx={e.dot.rx} ry={e.dot.ry} fill="var(--ink)" />
          ))}
        </>
      )
    case 'arc':
      return <path d={e.arc} fill="none" stroke="var(--ink)" strokeWidth={STROKE.face} strokeLinecap="round" />
    case 'ring':
      return (
        <>
          {e.ring.points.map(([cx, cy]) => (
            <g key={cx}>
              <ellipse cx={cx} cy={cy} rx={e.ring.rx} ry={e.ring.ry} fill="var(--white)" stroke="var(--ink)" strokeWidth={STROKE.ring} />
              <circle cx={cx} cy={cy + e.ring.pupilDy} r={e.ring.pupil} fill="var(--ink)" />
            </g>
          ))}
        </>
      )
    case 'line':
      return <path d={e.line} fill="none" stroke="var(--ink)" strokeWidth={STROKE.face} strokeLinecap="round" />
  }
}

function Mouth({ kind }: { kind: MouthKind }): React.JSX.Element | null {
  const m = FACE_SHAPES.mouth
  switch (kind) {
    case 'smile':
      return <path d={m.smile} fill="none" stroke="var(--ink)" strokeWidth={STROKE.face} strokeLinecap="round" />
    case 'small':
      return <path d={m.small} fill="none" stroke="var(--ink)" strokeWidth={STROKE.faceThin} strokeLinecap="round" />
    case 'open':
      return <path d={m.open} fill="var(--ink)" />
    case 'frown':
      return <path d={m.frown} fill="none" stroke="var(--ink)" strokeWidth={STROKE.face} strokeLinecap="round" />
    case 'o':
      return <ellipse cx={m.o.cx} cy={m.o.cy} rx={m.o.rx} ry={m.o.ry} fill="var(--ink)" />
    case 'none':
      return null
  }
}

function Cheeks(): React.JSX.Element {
  const c = FACE_SHAPES.cheeks
  return (
    <>
      {c.points.map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r={c.r} fill="var(--cheek)" opacity={c.opacity} />
      ))}
    </>
  )
}

/** 늘 그려 두고 쓰기·벗기를 전환(transition)으로 보인다: 위에서 내려와 쓰고, 위로 올리며 벗는다(pet.css) */
function Sunglasses({ on }: { on: boolean }): React.JSX.Element {
  const s = FACE_SHAPES.sunglasses
  return (
    <g className="pet-shades" data-on={on ? 'true' : 'false'}>
      {s.lenses.map(([x, y]) => (
        <rect key={x} x={x} y={y} width={s.width} height={s.height} rx={s.radius} fill="var(--ink)" />
      ))}
      <path d={s.bridge} fill="none" stroke="var(--ink)" strokeWidth={STROKE.face} />
      <path d={s.glint} fill="none" stroke="var(--white)" strokeWidth={STROKE.glint} strokeLinecap="round" opacity={s.glintOpacity} />
    </g>
  )
}

type FloatingProp = Exclude<PetProp, 'sunglasses'>

/** 앱 반응이 드는 소품: 자세별 자리(character.props)를 따른다. z·조종 표시는 각자 자리에 있다 */
const REACTION_PROPS: ReadonlySet<FloatingProp> = new Set(['envelope', 'alert'])

function Prop({ prop }: { prop: FloatingProp }): React.JSX.Element {
  switch (prop) {
    case 'envelope': {
      const e = PROP_SHAPES.envelope
      return (
        <g>
          <rect x={e.x} y={e.y} width={e.width} height={e.height} rx={e.radius} fill="var(--white)" stroke="var(--ink)" strokeWidth={STROKE.prop} />
          <path d={e.flap} fill="none" stroke="var(--ink)" strokeWidth={STROKE.prop} strokeLinejoin="round" />
        </g>
      )
    }
    case 'alert': {
      const a = PROP_SHAPES.alert
      return (
        <g>
          <circle cx={a.cx} cy={a.cy} r={a.r} fill="var(--warn)" stroke="var(--ink)" strokeWidth={STROKE.prop} />
          <path d={a.bar} fill="none" stroke="var(--ink)" strokeWidth={STROKE.mark} strokeLinecap="round" />
          <circle cx={a.dot.cx} cy={a.dot.cy} r={a.dot.r} fill="var(--ink)" />
        </g>
      )
    }
    case 'zzz':
      // 밝은 창 앞에서도 보이게 --ink 테두리를 글자 뒤에 깐다(paint-order)
      return (
        <g className="pet-zzz" fill="var(--mist)" stroke="var(--ink)" strokeWidth={1.6} strokeLinejoin="round" paintOrder="stroke" fontWeight={600}>
          {PROP_SHAPES.zzz.map((z) => (
            <text key={z.x} x={z.x} y={z.y} fontSize={z.size}>
              z
            </text>
          ))}
        </g>
      )
    case 'control': {
      const [a, b, c] = PROP_SHAPES.control.points
      return (
        <path
          d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]} Z`}
          fill="var(--brand)"
          stroke="var(--ink)"
          strokeWidth={PROP_SHAPES.control.stroke}
          strokeLinejoin="round"
        />
      )
    }
  }
}
