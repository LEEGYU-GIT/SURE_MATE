import { describe, expect, it } from 'vitest'
import type { PetPose } from '../../../shared/pet/pet-view'
import { CLIMB_OFFSET, PET_BASELINE } from '../../../shared/pet/pet-world'
import { CONTROL_BAND, FACE_CENTER, FACE_SHAPES, MALLANG_BODY, MALLANG_FACE, MALLANG_HIGHLIGHT, PROP_SHAPES, STROKE } from './mallang-shapes'

const POSES: PetPose[] = ['stand', 'walk', 'climb', 'sit', 'sleep', 'held', 'air']
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
  it('몸 경로는 시안 문자열 그대로(서기·걷기·공중은 같은 몸)', () => {
    const stand = 'M8 52 C8 30 18 16 32 16 C46 16 56 30 56 52 C56 57 50 58 32 58 C14 58 8 57 8 52 Z'
    expect(MALLANG_BODY.stand).toBe(stand)
    expect(MALLANG_BODY.walk).toBe(stand)
    expect(MALLANG_BODY.air).toBe(stand)
    expect(MALLANG_BODY.climb).toBe('M18 8 C30 8 40 14 42 32 C44 50 34 58 22 58 C14 58 12 52 12 32 C12 14 12 8 18 8 Z')
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

  it('하이라이트는 서기·걷기·공중에만: (21,27) 6×3.4, −28°, 흰색 55%', () => {
    expect(MALLANG_HIGHLIGHT).toMatchObject({ cx: 21, cy: 27, rx: 6, ry: 3.4, angle: -28, opacity: 0.55 })
    expect([...MALLANG_HIGHLIGHT.poses].sort()).toEqual(['air', 'stand', 'walk'])
  })

  it('자세별 얼굴 자리(서 있는 얼굴 가운데 (32,38) 기준 이동·배율)', () => {
    expect(MALLANG_FACE.sit).toEqual({ dx: 0, dy: 6, scale: 1 })
    expect(MALLANG_FACE.climb).toEqual({ dx: -7, dy: -18, scale: 0.85 })
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
