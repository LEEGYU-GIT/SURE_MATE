import { describe, expect, it } from 'vitest'
import { boundsOf, hitShape } from '../../../shared/pet/pet-frame'
import type { PetPose } from '../../../shared/pet/pet-view'
import { CLIMB_OFFSET, PET_BASELINE } from '../../../shared/pet/pet-world'
import { CONTROL_BAND, FACE_CENTER, FACE_SHAPES, MALLANG_BODY, MALLANG_FACE, MALLANG_HIGHLIGHT, MALLANG_PROPS, mallangControlPlace, mallangPropPlace, PROP_SHAPES, STROKE } from './mallang-shapes'

const POSES: PetPose[] = ['stand', 'walk', 'climb', 'sit', 'sleep', 'held', 'air']
/** 시안(docs/design/mallang-mate.html)의 오르기 몸. 납작한 면이 왼쪽이라 오른쪽 바에 둥근 면이 붙어 보였다 */
const MOCK_CLIMB =
  'M18 8 C30 8 40 14 42 32 C44 50 34 58 22 58 C14 58 12 52 12 32 C12 14 12 8 18 8 Z'
/** 오른쪽 바 면(격자 x): 발 가운데 32 + CLIMB_OFFSET. 왼쪽 바는 뒤집어 그려 32 − CLIMB_OFFSET */
const BAR_FACE = 32 + CLIMB_OFFSET * 64
const numbers = (d: string): number[] => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)

/** 몸 경로(M·C·Z 절대 좌표)를 따라 점을 찍는다: 외곽 범위를 확인하는 데 쓴다 */
function outlinePoints(d: string): { x: number; y: number }[] {
  const tokens = d.match(/[MCZ]|-?\d*\.?\d+/g) ?? []
  const pts: { x: number; y: number }[] = []
  let i = 0
  let cur = { x: 0, y: 0 }
  const point = (): { x: number; y: number } => ({ x: Number(tokens[i++]), y: Number(tokens[i++]) })
  while (i < tokens.length) {
    const cmd = tokens[i++]
    if (cmd === 'M') {
      cur = point()
      pts.push(cur)
    } else if (cmd === 'C') {
      const [p1, p2, p3] = [point(), point(), point()]
      for (let k = 1; k <= 200; k++) {
        const t = k / 200
        const a = (1 - t) ** 3
        const b = 3 * (1 - t) ** 2 * t
        const c = 3 * (1 - t) * t ** 2
        const e = t ** 3
        pts.push({ x: a * cur.x + b * p1.x + c * p2.x + e * p3.x, y: a * cur.y + b * p1.y + c * p2.y + e * p3.y })
      }
      cur = p3
    } else if (cmd !== 'Z') {
      throw new Error(`몸 경로는 M·C·Z만 쓴다: ${cmd}`)
    }
  }
  return pts
}

describe('말랑 메이트 그림(시안 원본, 64 격자)', () => {
  it('몸 경로는 시안 문자열 그대로(서기·걷기·공중은 같은 몸), 오르기만 좌우로 뒤집었다', () => {
    const stand = 'M8 52 C8 30 18 16 32 16 C46 16 56 30 56 52 C56 57 50 58 32 58 C14 58 8 57 8 52 Z'
    expect(MALLANG_BODY.stand).toBe(stand)
    expect(MALLANG_BODY.walk).toBe(stand)
    expect(MALLANG_BODY.air).toBe(stand)
    expect(MALLANG_BODY.climb).toBe('M36.5 8 C24.5 8 14.5 14 12.5 32 C10.5 50 20.5 58 32.5 58 C40.5 58 42.5 52 42.5 32 C42.5 14 42.5 8 36.5 8 Z')
    // 시안 몸을 x → 54.5 − x로 뒤집은 모양 그대로(다시 그리지 않음): 같은 차례의 점이 서로 맞선다
    const flipped = outlinePoints(MALLANG_BODY.climb)
    const mock = outlinePoints(MOCK_CLIMB)
    expect(flipped).toHaveLength(mock.length)
    flipped.forEach((p, i) => {
      expect(p.x, String(i)).toBeCloseTo(54.5 - mock[i].x, 9)
      expect(p.y, String(i)).toBeCloseTo(mock[i].y, 9)
    })
    expect(MALLANG_BODY.sit).toBe('M6 54 C6 38 18 30 32 30 C46 30 58 38 58 54 C58 58 50 59 32 59 C14 59 6 58 6 54 Z')
    expect(MALLANG_BODY.sleep).toBe('M6 54 C6 40 18 33 32 33 C46 33 58 40 58 54 C58 58 50 59 32 59 C14 59 6 58 6 54 Z')
    expect(MALLANG_BODY.held).toBe('M32 4 C38 4 42 12 44 26 C47 44 44 60 32 60 C20 60 17 44 20 26 C22 12 26 4 32 4 Z')
  })

  it('모든 자세 경로의 숫자는 0~64 격자 안', () => {
    for (const pose of POSES) {
      const ns = numbers(MALLANG_BODY[pose])
      expect(ns.length, pose).toBeGreaterThan(0)
      for (const n of ns) expect(n >= 0 && n <= 64, `${pose}: ${n}`).toBe(true)
    }
  })

  it('세계 모델과 맞는다: 서 있는 몸의 아래 끝이 바닥선, 오르는 몸의 외곽선이 바 면, 들린 몸의 위 끝이 잡는 점', () => {
    const stand = outlinePoints(MALLANG_BODY.stand)
    expect(Math.max(...stand.map((p) => p.y))).toBeCloseTo(PET_BASELINE * 64, 5)
    // 벽이 오른쪽일 때 외곽선(굵기 3의 절반)까지 포함한 오른쪽 끝 = 발 가운데(32) + CLIMB_OFFSET
    const climb = outlinePoints(MALLANG_BODY.climb)
    const face = Math.max(...climb.map((p) => p.x)) + STROKE.outline / 2
    expect(Math.abs(face - (32 + CLIMB_OFFSET * 64))).toBeLessThan(0.5)
    // 들린 동안 커서가 격자 (32, 4)에 온다(상태 기계)
    const held = outlinePoints(MALLANG_BODY.held)
    expect(Math.min(...held.map((p) => p.y))).toBeCloseTo(4, 5)
  })

  it('(2026-11-12) 오르는 몸은 납작한 면이 바 면에 붙고 둥근 면은 바 반대쪽으로 부푼다(왼쪽 바는 x 32 기준으로 뒤집어 그린다)', () => {
    const body = outlinePoints(MALLANG_BODY.climb)
    const xs = body.map((p) => p.x)
    const wall = Math.max(...xs)
    const out = Math.min(...xs)
    const edgeAt = (y: number, pick: (...v: number[]) => number): number =>
      pick(...body.filter((p) => Math.abs(p.y - y) < 0.6).map((p) => p.x))
    // 벽 쪽(오른쪽) 면: 외곽선 바깥 끝이 바 면 x 44이고, 몸 높이(8~58)의 대부분인 15~45에서 0.5칸 안으로 곧다
    expect(wall + STROKE.outline / 2).toBeCloseTo(BAR_FACE, 9)
    for (let y = 15; y <= 45; y += 2) expect(wall - edgeAt(y, Math.max), `y ${y}`).toBeLessThan(0.5)
    // 바깥쪽(왼쪽) 면은 둥글다: 가운데 높이(y 32)에서 가장 바깥이고, 머리 쪽(y 16)은 5칸 넘게 안으로 들어간다
    expect(edgeAt(32, Math.min) - out).toBeLessThan(0.5)
    expect(edgeAt(16, Math.min) - out).toBeGreaterThan(5)
    // 왼쪽 바: 뒤집으면(x → 64 − x) 납작한 면의 외곽선 바깥 끝이 그 바 면 x 20
    expect(64 - (wall + STROKE.outline / 2)).toBeCloseTo(32 - CLIMB_OFFSET * 64, 9)
  })

  it('(2026-11-12) 오르는 얼굴은 몸과 함께 옮겼다: 선글라스·동그란 눈·반달 눈의 양 끝이 그 높이의 몸 안쪽 외곽선 안', () => {
    // 몸과 얼굴은 같은 그룹으로 뒤집히므로(PetSprite MIRROR) 그대로 그린 쪽만 보면 된다
    const f = MALLANG_FACE.climb
    const X = (x: number): number => FACE_CENTER.x + (x - FACE_CENTER.x) * f.scale + f.dx
    const Y = (y: number): number => FACE_CENTER.y + (y - FACE_CENTER.y) * f.scale + f.dy
    const body = outlinePoints(MALLANG_BODY.climb)
    const inner = (y: number): [number, number] => {
      const xs = body.filter((p) => Math.abs(p.y - y) < 0.6).map((p) => p.x)
      return [Math.min(...xs) + STROKE.outline / 2, Math.max(...xs) - STROKE.outline / 2]
    }
    const { sunglasses: s, eyes } = FACE_SHAPES
    const ring = eyes.ring
    const ringPad = ring.rx + STROKE.ring / 2
    const arcXs = numbers(eyes.arc).filter((_, i) => i % 2 === 0)
    // [이름, 왼쪽 끝, 오른쪽 끝, 그 높이](서 있는 얼굴 좌표, 선 굵기 절반 포함). 렌즈는 양 끝이 반원이라 가운데 높이가 가장 넓다
    const spans: [string, number, number, number][] = [
      ['선글라스', s.lenses[0][0], s.lenses[1][0] + s.width, s.lenses[0][1] + s.height / 2],
      ['동그란 눈', ring.points[0][0] - ringPad, ring.points[1][0] + ringPad, ring.points[0][1]],
      ['반달 눈', Math.min(...arcXs) - STROKE.face / 2, Math.max(...arcXs) + STROKE.face / 2, 38]
    ]
    for (const [name, l, r, y] of spans) {
      const [lo, hi] = inner(Y(y))
      expect(X(l), `${name} 왼쪽`).toBeGreaterThan(lo)
      expect(X(r), `${name} 오른쪽`).toBeLessThan(hi)
    }
  })

  it('(2026-11-12) 판정 사각형은 그림과 맞는다: 자세마다 몸 외곽선(굵기 포함) 범위와 1칸 안, 오르기는 바 쪽 끝이 바 면(바를 누른 클릭을 가로채지 않게)', () => {
    const unit = { x: 0, y: 0, width: 64, height: 64 }
    const half = STROKE.outline / 2
    const EDGES = ['왼쪽', '오른쪽', '위', '아래']
    for (const pose of POSES) {
      for (const mirror of [false, true]) {
        const pts = outlinePoints(MALLANG_BODY[pose])
        const xs = pts.map((p) => (mirror ? 64 - p.x : p.x))
        const ys = pts.map((p) => p.y)
        // 네 변(왼쪽·오른쪽·위·아래): 외곽선(굵기 포함)을 감싼 범위와 판정 사각형을 감싼 범위
        const drawn = [
          Math.min(...xs) - half,
          Math.max(...xs) + half,
          Math.min(...ys) - half,
          Math.max(...ys) + half
        ]
        const r = boundsOf(hitShape(pose, unit, mirror))!
        const hit = [r.x, r.x + r.width, r.y, r.y + r.height]
        const label = `${pose}${mirror ? '(뒤집힘)' : ''}`
        for (let i = 0; i < 4; i++) {
          expect(Math.abs(hit[i] - drawn[i]), `${label} ${EDGES[i]}`).toBeLessThanOrEqual(1)
        }
      }
    }
    const right = boundsOf(hitShape('climb', unit, false))!
    const left = boundsOf(hitShape('climb', unit, true))!
    expect(right.x + right.width).toBe(BAR_FACE)
    expect(left.x).toBe(64 - BAR_FACE)
  })

  it('하이라이트는 서기·걷기·공중에만: (21,27) 6×3.4, −28°, 흰색 55%', () => {
    expect(MALLANG_HIGHLIGHT).toMatchObject({ cx: 21, cy: 27, rx: 6, ry: 3.4, angle: -28, opacity: 0.55 })
    expect([...MALLANG_HIGHLIGHT.poses].sort()).toEqual(['air', 'stand', 'walk'])
  })

  it('자세별 얼굴 자리(서 있는 얼굴 가운데 (32,38) 기준 이동·배율)', () => {
    expect(MALLANG_FACE.sit).toEqual({ dx: 0, dy: 6, scale: 1 })
    // 오르기: 시안 자리(가운데 x 25)를 몸과 함께 x → 54.5 − x로 뒤집은 x 29.5
    expect(MALLANG_FACE.climb).toEqual({ dx: -2.5, dy: -18, scale: 0.85 })
    expect(FACE_CENTER.x + MALLANG_FACE.climb.dx).toBe(54.5 - 25)
    expect(MALLANG_FACE.stand).toEqual({ dx: 0, dy: 0, scale: 1 })
    expect(MALLANG_FACE.air).toEqual({ dx: 0, dy: 0, scale: 1 })
    // 시안의 통통 걷기 칸: 얼굴이 가는 쪽으로 3칸(왼쪽으로 가면 뒤집혀 왼쪽을 본다)
    expect(MALLANG_FACE.walk).toEqual({ dx: 3, dy: 0, scale: 1 })
    expect(MALLANG_FACE.sleep).toEqual({ dx: 0, dy: 8, scale: 1 })
    // 들림: 늘어난 몸의 넓은 쪽으로 2칸. 놀란 입이 시안 자리(y 45)에 오고 선글라스가 좁은 몸 안에 들어간다
    expect(MALLANG_FACE.held).toEqual({ dx: 0, dy: -2, scale: 0.85 })
  })

  it('들린 얼굴: 놀란 입이 시안의 들림 칸 자리(y 45) 근처, 선글라스가 몸 안', () => {
    const place = (p: readonly [number, number], f = MALLANG_FACE.held): [number, number] => [
      FACE_CENTER.x + (p[0] - FACE_CENTER.x) * f.scale + f.dx,
      FACE_CENTER.y + (p[1] - FACE_CENTER.y) * f.scale + f.dy
    ]
    const [, mouthY] = place([FACE_SHAPES.mouth.o.cx, FACE_SHAPES.mouth.o.cy])
    expect(Math.abs(mouthY - 45)).toBeLessThan(0.5)
    // 왼쪽 렌즈 왼쪽 끝이 그 높이의 몸 안쪽 외곽선(왼쪽 경로 x + 1.5)보다 안에 있다(오른쪽은 좌우 대칭)
    const s = FACE_SHAPES.sunglasses
    const [lensX, lensTop] = place(s.lenses[0])
    const held = outlinePoints(MALLANG_BODY.held)
    const leftAt = (y: number): number => Math.min(...held.filter((p) => Math.abs(p.y - y) < 0.6 && p.x < 32).map((p) => p.x))
    for (const y of [lensTop, lensTop + s.height * MALLANG_FACE.held.scale]) {
      expect(lensX, `y ${y.toFixed(2)}`).toBeGreaterThan(leftAt(y) + STROKE.outline / 2)
    }
  })

  it('얼굴 부품: 시안 좌표 그대로', () => {
    const { eyes, mouth, brows, cheeks, sunglasses } = FACE_SHAPES
    expect(eyes.dot).toEqual({ points: [[26, 38], [38, 38]], rx: 2.6, ry: 3.6 })
    expect(eyes.arc).toBe('M22 38 Q25 35 28 38 M36 38 Q39 35 42 38')
    expect(eyes.ring).toMatchObject({ points: [[26, 38], [38, 38]], rx: 3, ry: 4, pupil: 1.4 })
    expect(eyes.line).toBe('M22 38 h6 M36 38 h6')
    expect(mouth.smile).toBe('M28 45 Q32 48.5 36 45')
    expect(mouth.small).toBe('M29 44 Q32 46.5 35 44')
    expect(mouth.open).toBe('M27 44 Q32 50 37 44 Z')
    expect(mouth.frown).toBe('M28 48 Q32 45 36 48')
    expect(mouth.o).toMatchObject({ rx: 2.6, ry: 3.2 })
    expect(brows).toBe('M21 31 L28 33 M43 31 L36 33')
    expect(cheeks).toEqual({ points: [[20, 45], [44, 45]], r: 2.8, opacity: 0.8 })
    expect(sunglasses).toEqual({ lenses: [[19, 33], [33, 33]], width: 12, height: 8, radius: 4, bridge: 'M31 36 h2', glint: 'M22 35 h4', glintOpacity: 0.7 })
  })

  it('얼굴 부품의 숫자는 모두 0~64 격자 안', () => {
    const { eyes, mouth, brows, cheeks, sunglasses } = FACE_SHAPES
    const ns = [
      ...[eyes.arc, eyes.line, mouth.smile, mouth.small, mouth.open, mouth.frown, brows, sunglasses.bridge, sunglasses.glint].flatMap(numbers),
      ...eyes.dot.points.flat(),
      ...eyes.ring.points.flat(),
      mouth.o.cx,
      mouth.o.cy,
      ...cheeks.points.flat(),
      ...sunglasses.lenses.flatMap(([x, y]) => [x, y, x + sunglasses.width, y + sunglasses.height])
    ]
    for (const n of ns) expect(n >= 0 && n <= 64, String(n)).toBe(true)
  })

  it('소품(상자 좌표): 편지·느낌표·z 두 개', () => {
    expect(PROP_SHAPES.envelope).toEqual({ x: 40, y: 0, width: 20, height: 14, radius: 2, flap: 'M40.5 1 L50 8 L59.5 1' })
    expect(PROP_SHAPES.alert).toEqual({ cx: 52, cy: 10, r: 8, bar: 'M52 5.5 v5.5', dot: { cx: 52, cy: 14.3, r: 1.4 } })
    expect(PROP_SHAPES.zzz).toEqual([
      { x: 44, y: 26, size: 11 },
      { x: 51, y: 17, size: 8 }
    ])
  })

  it('조종 표시는 머리 위 격자 y −14~−2 안(외곽선 포함), 가운데 x 32', () => {
    expect(CONTROL_BAND).toEqual({ top: -14, bottom: -2 })
    const ys = PROP_SHAPES.control.points.map(([, y]) => y)
    const xs = PROP_SHAPES.control.points.map(([x]) => x)
    const half = PROP_SHAPES.control.stroke / 2
    expect(Math.min(...ys) - half).toBeGreaterThanOrEqual(CONTROL_BAND.top)
    expect(Math.max(...ys) + half).toBeLessThanOrEqual(CONTROL_BAND.bottom)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBe(32)
  })
})

describe('(Task 6 이월) 반응 소품(편지·느낌표)은 자세마다 머리 가까이에 둔다', () => {
  type Place = { dx: number; dy: number }
  const env = PROP_SHAPES.envelope
  const alert = PROP_SHAPES.alert
  /** 소품과 몸 외곽선 사이의 가장 가까운 거리(격자, 선 굵기 제외 전) */
  const toRect = (p: { x: number; y: number }, at: Place): number => {
    const x0 = env.x + at.dx
    const y0 = env.y + at.dy
    const dx = Math.max(x0 - p.x, 0, p.x - (x0 + env.width))
    const dy = Math.max(y0 - p.y, 0, p.y - (y0 + env.height))
    return Math.hypot(dx, dy)
  }
  const toCircle = (p: { x: number; y: number }, at: Place): number => Math.hypot(p.x - (alert.cx + at.dx), p.y - (alert.cy + at.dy)) - alert.r
  const body = (pose: PetPose, mirror: boolean): { x: number; y: number }[] =>
    outlinePoints(MALLANG_BODY[pose]).map((p) => (mirror ? { x: 64 - p.x, y: p.y } : p))
  /** 몸 외곽선 절반 + 소품 외곽선 절반: 이보다 가까우면 선이 닿는다 */
  const TOUCH = STROKE.outline / 2 + STROKE.prop / 2
  const CASES: [PetPose, boolean][] = [...POSES.map((p): [PetPose, boolean] => [p, false]), ['climb', true]]

  it('서기·걷기·공중은 시안 자리 그대로(이동 없음)', () => {
    for (const pose of ['stand', 'walk', 'air'] as const) {
      expect(MALLANG_PROPS[pose], pose).toEqual({ dx: 0, dy: 0 })
      expect(mallangPropPlace(pose, true), pose).toEqual({ dx: 0, dy: 0 })
    }
  })

  it('어느 자세에서도 몸 외곽선과 닿지 않고, 머리에서 10칸 안에 떠 있다(앉기·졸기의 퍼진 머리 위 12~16칸에 뜨지 않게)', () => {
    for (const [pose, mirror] of CASES) {
      const at = mallangPropPlace(pose, mirror)
      const pts = body(pose, mirror)
      const rectGap = Math.min(...pts.map((p) => toRect(p, at)))
      const circleGap = Math.min(...pts.map((p) => toCircle(p, at)))
      const label = `${pose}${mirror ? '(뒤집힘)' : ''}`
      expect(rectGap, `${label} 편지`).toBeGreaterThan(TOUCH)
      expect(circleGap, `${label} 느낌표`).toBeGreaterThan(TOUCH)
      expect(Math.min(rectGap, circleGap), label).toBeLessThanOrEqual(10)
    }
  })

  it('(Task 7 이월 → Task 8) 조종 표시도 자세마다 머리 위 같은 간격(서기와 같은 18칸 ± 2)에 뜬다: 앉기의 퍼진 머리 위 32칸에 뜨지 않게', () => {
    const xs = PROP_SHAPES.control.points.map(([x]) => x)
    const half = PROP_SHAPES.control.stroke / 2
    const gapOf = (pose: PetPose, mirror: boolean): number => {
      const at = mallangControlPlace(pose, mirror)
      const lo = Math.min(...xs) - half + at.dx
      const hi = Math.max(...xs) + half + at.dx
      const top = Math.min(...body(pose, mirror).filter((p) => p.x >= lo && p.x <= hi).map((p) => p.y))
      return top - (CONTROL_BAND.bottom + at.dy)
    }
    for (const pose of ['stand', 'walk', 'air'] as const) {
      expect(mallangControlPlace(pose, false), pose).toEqual({ dx: 0, dy: 0 })
    }
    const stand = gapOf('stand', false)
    expect(stand).toBe(18)
    for (const [pose, mirror] of CASES) {
      expect(Math.abs(gapOf(pose, mirror) - stand), `${pose}${mirror ? '(뒤집힘)' : ''}`).toBeLessThanOrEqual(2)
    }
    // 오르기는 위를 보는 얼굴 쪽(벽 반대쪽)으로, 뒤집히면 반대로
    expect(mallangControlPlace('climb', false).dx).toBe(MALLANG_FACE.climb.dx)
    expect(mallangControlPlace('climb', true).dx).toBe(-MALLANG_FACE.climb.dx)
  })

  it('오르기: 소품은 바 면 반대쪽(오른쪽 벽이면 몸 가운데보다 왼쪽, 뒤집혀 왼쪽 벽이면 몸 가운데보다 오른쪽. 외곽선 포함)', () => {
    const xs = outlinePoints(MALLANG_BODY.climb).map((p) => p.x)
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2
    const half = STROKE.prop / 2
    const right = mallangPropPlace('climb', false)
    expect(env.x + env.width + right.dx + half).toBeLessThan(mid)
    expect(alert.cx + alert.r + right.dx + half).toBeLessThan(mid)
    const left = mallangPropPlace('climb', true)
    expect(env.x + left.dx - half).toBeGreaterThan(64 - mid)
    expect(alert.cx - alert.r + left.dx - half).toBeGreaterThan(64 - mid)
    // 뒤집힌 자리는 소품 묶음(가운데 x 50)을 x 32 기준으로 옮긴 것이다(글자 모양은 뒤집지 않음)
    expect(env.x + env.width / 2 + left.dx).toBe(64 - (env.x + env.width / 2 + right.dx))
  })
})
