import { PET_BASELINE, type PetWorld } from './pet-world'

export const PHYSICS = {
  gravity: 2000,
  restitution: 0.3,
  minBounceSpeed: 150,
  maxThrowSpeed: 2400,
  throwWindowMs: 100,
  maxDt: 0.1
} as const

/** 발 가운데 x·바닥선 y(DIP), 속도(DIP/초). */
export interface Body {
  x: number
  y: number
  vx: number
  vy: number
}

export type AirContact = 'none' | 'bounce' | 'floor' | 'ledge' | 'wall' | 'ceiling'

export function stepAir(
  body: Body,
  dt: number,
  world: PetWorld,
  o: { size: number; bounced: boolean; reduceMotion: boolean }
): { body: Body; contact: AirContact; bounced: boolean } {
  const g = PHYSICS.gravity
  const t = Math.min(Math.max(dt, 0), PHYSICS.maxDt)
  const y0 = Math.min(body.y, world.floorY)
  const vy0 = body.vy
  let x = body.x + body.vx * t
  let y = y0 + vy0 * t + 0.5 * g * t * t
  let vx = body.vx
  let vy = vy0 + g * t
  let contact: AirContact = 'none'
  let bounced = o.bounced

  // 1. 천장
  if (y < world.topY) {
    y = world.topY
    vy = 0
    contact = 'ceiling'
  }

  // 2. 바 꼭대기
  const ledge = world.ledge
  if (ledge && y0 <= ledge.y && y > ledge.y && x >= ledge.x1 - o.size / 4 && x <= ledge.x2 + o.size / 4) {
    y = ledge.y
    vx = 0
    vy = 0
    contact = 'ledge'
  }

  // 3. 바 옆면(몸 상자가 바와 겹치면 안쪽 면 밖으로 민다)
  const bar = world.bar
  if (bar) {
    const r = bar.rect
    const bodyTop = y - PET_BASELINE * o.size
    const overlapX = x + o.size / 2 > r.x && x - o.size / 2 < r.x + r.width
    const overlapY = y > r.y && bodyTop < r.y + r.height
    if (overlapX && overlapY) {
      x = bar.edge === 'right' ? r.x - o.size / 2 : r.x + r.width + o.size / 2
      vx = -PHYSICS.restitution * vx
      contact = 'wall'
    }
  }

  // 4. 화면 벽
  if (x < world.minX || x > world.maxX) {
    x = Math.min(Math.max(x, world.minX), world.maxX)
    vx = -PHYSICS.restitution * vx
    contact = 'wall'
  }

  // 5. 바닥
  if (y >= world.floorY) {
    const speed = Math.sqrt(vy0 * vy0 + 2 * g * (world.floorY - y0))
    y = world.floorY
    if (!bounced && speed > PHYSICS.minBounceSpeed && !o.reduceMotion) {
      vy = -PHYSICS.restitution * speed
      vx *= 0.5
      bounced = true
      contact = 'bounce'
    } else {
      vx = 0
      vy = 0
      contact = 'floor'
    }
  }

  return { body: { x, y, vx, vy }, contact, bounced }
}

/** 마지막 100ms 안 가장 오래된 표본과 마지막 표본의 차이로 던진 속도를 구한다. */
export function throwVelocity(
  samples: { t: number; x: number; y: number }[],
  now: number
): { vx: number; vy: number } {
  const recent = samples.filter((s) => s.t >= now - PHYSICS.throwWindowMs)
  if (recent.length < 2) return { vx: 0, vy: 0 }
  const a = recent[0]
  const b = recent[recent.length - 1]
  const sec = (b.t - a.t) / 1000
  if (!(sec > 0)) return { vx: 0, vy: 0 }
  let vx = (b.x - a.x) / sec
  let vy = (b.y - a.y) / sec
  const speed = Math.hypot(vx, vy)
  if (speed > PHYSICS.maxThrowSpeed) {
    const k = PHYSICS.maxThrowSpeed / speed
    vx *= k
    vy *= k
  }
  return { vx, vy }
}

export function jumpVelocity(height: number): number {
  return height > 0 ? -Math.sqrt(2 * PHYSICS.gravity * height) : 0
}

/** 이 속도(DIP/초)보다 느리게 놓으면 내려놓은 것으로 본다(바 꼭대기 바로 아래에서 놓으면 앉는다) */
export const DROP_SNAP_SPEED = 300

/**
 * 들린 펫을 느리게 놓았을 때 바 꼭대기에 앉힐 발 자리(설계 §14-2 "바 꼭대기에 떨어지면 앉는다", M6 최종 검토 I2).
 * 들린 펫은 커서 아래에 매달려 바 위에 겹쳐 그려지므로, 사람이 꼭대기에 내려놓으면 발이 꼭대기보다 조금 아래에 있다.
 * 그대로 떨어뜨리면 stepAir가 몸을 바 옆면 밖으로 밀어 바닥에 떨어진다. 그래서 속도가 DROP_SNAP_SPEED보다 느리고,
 * 발이 꼭대기 아래 몸 높이의 절반(PET_BASELINE·크기/2) 안이며, x가 꼭대기 범위(양끝 + 크기/4, stepAir와 같은 범위) 안이면
 * 그 x로 꼭대기에 올린다. 꼭대기 위·같은 높이는 stepAir가 내려앉힌다. 아니면 null(그대로 떨어진다)
 */
export function dropOnLedge(body: Body, world: PetWorld, size: number): { x: number; y: number } | null {
  const l = world.ledge
  if (!l) return null
  if (!(Math.hypot(body.vx, body.vy) < DROP_SNAP_SPEED)) return null
  const below = body.y - l.y
  if (!(below > 0 && below <= (PET_BASELINE * size) / 2)) return null
  if (!(body.x >= l.x1 - size / 4 && body.x <= l.x2 + size / 4)) return null
  return { x: body.x, y: l.y }
}
