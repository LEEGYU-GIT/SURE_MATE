import { describe, expect, it } from 'vitest'
import type { MonitorInfo } from '../types'
import { PET_BASELINE, petWorld } from './pet-world'
import { DROP_SNAP_SPEED, dropOnLedge, jumpVelocity, stepAir, throwVelocity, type AirContact, type Body } from './pet-physics'

const mon: MonitorInfo = {
  id: '1',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
  isPrimary: true,
  isInternal: false
}
const world = petWorld(mon, { rect: { x: 1864, y: 292, width: 56, height: 456 }, edge: 'right' }, 56)
const opt = { size: 56, bounced: false, reduceMotion: false }

describe('stepAir', () => {
  it('낙하: 한 번만 튀고 멈춘다', () => {
    let body: Body = { x: 500, y: 40, vx: 0, vy: 0 }
    let bounced = false
    const contacts: AirContact[] = []
    let peak = Infinity
    let afterBounce = false
    for (let i = 0; i < 400; i++) {
      const r = stepAir(body, 1 / 30, world, { ...opt, bounced })
      body = r.body
      bounced = r.bounced
      contacts.push(r.contact)
      if (r.contact === 'bounce') {
        expect(Math.abs(r.body.vy + 600)).toBeLessThan(4) // 시작 y 40이 천장(50.75) 위라 50.75에서 낙하: 실제 -596.77
        afterBounce = true
      } else if (afterBounce) peak = Math.min(peak, body.y)
      if (r.contact === 'floor') break
    }
    expect(contacts.filter((c) => c === 'bounce')).toHaveLength(1)
    expect(1040 - peak).toBeGreaterThan(88)
    expect(1040 - peak).toBeLessThan(92)
    expect(contacts[contacts.length - 1]).toBe('floor')
    expect(body.vy).toBe(0)
    expect(body.vx).toBe(0)
  })
  it('움직임 줄이기와 느린 닿음은 튀지 않는다', () => {
    let r = stepAir({ x: 500, y: 1035, vx: 0, vy: 0 }, 0.1, world, { ...opt, reduceMotion: true })
    expect(r.contact).toBe('floor')
    r = stepAir({ x: 500, y: 1039, vx: 0, vy: 0 }, 0.1, world, opt)
    expect(r.contact).toBe('floor')
  })
  it('바 꼭대기에 내려앉는다', () => {
    let body: Body = { x: 1892, y: 100, vx: 0, vy: 0 }
    let contact: AirContact = 'none'
    for (let i = 0; i < 100 && contact === 'none'; i++) {
      const r = stepAir(body, 1 / 30, world, opt)
      body = r.body
      contact = r.contact
    }
    expect(contact).toBe('ledge')
    expect(body.y).toBe(292)
    expect(body.vy).toBe(0)
  })
  it('바 옆면에서 튕긴다', () => {
    const r = stepAir({ x: 1700, y: 600, vx: 2000, vy: 0 }, 0.1, world, opt)
    expect(r.contact).toBe('wall')
    expect(r.body.x).toBe(1836)
    expect(r.body.vx).toBeCloseTo(-600, 6)
  })
  it('화면 벽', () => {
    const r = stepAir({ x: 100, y: 500, vx: -1000, vy: 0 }, 0.2, world, opt)
    expect(r.contact).toBe('wall')
    expect(r.body.x).toBe(28)
    expect(r.body.vx).toBeCloseTo(300, 6)
  })
  it('천장', () => {
    const r = stepAir({ x: 500, y: 300, vx: 0, vy: -3000 }, 0.2, world, opt)
    expect(r.contact).toBe('ceiling')
    expect(r.body.y).toBe(50.75)
    expect(r.body.vy).toBe(0)
  })
  it('dt는 0.1로 자른다', () => {
    const a = stepAir({ x: 500, y: 200, vx: 0, vy: 0 }, 5, world, opt)
    const b = stepAir({ x: 500, y: 200, vx: 0, vy: 0 }, 0.1, world, opt)
    expect(a.body).toEqual(b.body)
  })
  it('바닥 아래에서 시작해도 NaN 없다', () => {
    const r = stepAir({ x: 500, y: 1060, vx: 0, vy: 0 }, 1 / 30, world, opt)
    expect(r.contact).toBe('floor')
    expect(r.body.y).toBe(1040)
  })
  it('dt 0, 크기 0, 바 안, 바 없음에서도 유한', () => {
    const cases: [Body, number, typeof world, number][] = [
      [{ x: 500, y: 500, vx: 5, vy: 5 }, 0, world, 56],
      [{ x: 1890, y: 500, vx: 0, vy: 0 }, 0.03, world, 56],
      [{ x: 500, y: 500, vx: 5, vy: 5 }, 0.03, petWorld(mon, null, 0), 0],
      [{ x: 500, y: 500, vx: 5, vy: 5 }, 0.03, petWorld(mon, { rect: { x: 5000, y: 0, width: 0, height: 0 }, edge: 'left' }, 56), 56]
    ]
    for (const [b, dt, w, size] of cases) {
      const r = stepAir(b, dt, w, { ...opt, size })
      for (const v of Object.values(r.body)) expect(Number.isFinite(v)).toBe(true)
    }
  })
})

describe('throwVelocity', () => {
  it('최근 100ms 표본', () => {
    const s = [{ t: 0, x: 0, y: 0 }, { t: 50, x: 50, y: -20 }, { t: 100, x: 100, y: -40 }]
    expect(throwVelocity(s, 100)).toEqual({ vx: 1000, vy: -400 })
    expect(throwVelocity([{ t: -50, x: -999, y: 0 }, ...s], 100)).toEqual({ vx: 1000, vy: -400 })
  })
  it('표본 하나는 0', () => {
    expect(throwVelocity([{ t: 0, x: 0, y: 0 }], 0)).toEqual({ vx: 0, vy: 0 })
  })
  it('최대 속도 2400', () => {
    const v = throwVelocity([{ t: 0, x: 0, y: 0 }, { t: 100, x: 1000, y: 0 }], 100)
    expect(v.vx).toBeCloseTo(2400, 6)
    expect(v.vy).toBeCloseTo(0, 6)
  })
})

describe('jumpVelocity', () => {
  it('높이 292', () => {
    expect(jumpVelocity(292)).toBeCloseTo(-1080.7, 1)
    expect(jumpVelocity(0)).toBe(0)
  })
})

describe('dropOnLedge: 느리게 놓은 펫의 발이 바 꼭대기 바로 아래면 꼭대기에 앉힌다(M6 최종 검토 I2, §14-2 "바 꼭대기에 떨어지면 앉는다")', () => {
  const still = (x: number, y: number): Body => ({ x, y, vx: 0, vy: 0 })

  it('발이 꼭대기(292) 아래 1·10·20 DIP이면 그 x로 꼭대기에 올린다', () => {
    for (const below of [1, 10, 20]) expect(dropOnLedge(still(1892, 292 + below), world, 56)).toEqual({ x: 1892, y: 292 })
  })

  it('몸 높이의 절반(56 → 25.375 DIP)까지 올리고, 그보다 깊거나 40 DIP 넘게 아래면 그대로 떨어진다(옆면에 밀려난다)', () => {
    const half = (PET_BASELINE * 56) / 2
    expect(half).toBeCloseTo(25.375, 6)
    expect(dropOnLedge(still(1892, 292 + half), world, 56)).toEqual({ x: 1892, y: 292 })
    expect(dropOnLedge(still(1892, 292 + half + 0.5), world, 56)).toBeNull()
    for (const below of [40, 100]) expect(dropOnLedge(still(1892, 292 + below), world, 56)).toBeNull()
    // 크기를 따른다: 40이면 절반 18.125, 72면 32.625
    expect(dropOnLedge(still(1892, 292 + 20), petWorld(mon, world.bar, 40), 40)).toBeNull()
    expect(dropOnLedge(still(1892, 292 + 30), petWorld(mon, world.bar, 72), 72)).toEqual({ x: 1892, y: 292 })
  })

  it('x는 꼭대기 양끝 + 크기/4 안(1850~1934)만, 밖이면 null(바닥으로 떨어진다)', () => {
    expect(dropOnLedge(still(1850, 300), world, 56)).toEqual({ x: 1850, y: 292 })
    expect(dropOnLedge(still(1849, 300), world, 56)).toBeNull()
  })

  it(`빠르게 던지면(${DROP_SNAP_SPEED} DIP/초 이상) 그대로 날아간다. 꼭대기 위·꼭대기와 같은 높이는 stepAir가 내려앉힌다`, () => {
    expect(DROP_SNAP_SPEED).toBe(300)
    expect(dropOnLedge({ x: 1892, y: 302, vx: 0, vy: 300 }, world, 56)).toBeNull()
    expect(dropOnLedge({ x: 1892, y: 302, vx: -250, vy: 200 }, world, 56)).toBeNull()
    expect(dropOnLedge({ x: 1892, y: 302, vx: 200, vy: -200 }, world, 56)).toEqual({ x: 1892, y: 292 })
    expect(dropOnLedge(still(1892, 280), world, 56)).toBeNull()
    expect(dropOnLedge(still(1892, 292), world, 56)).toBeNull()
  })

  it('꼭대기가 없는 세계(바 없음·자리 없는 바)와 유한하지 않은 값은 null', () => {
    expect(dropOnLedge(still(1892, 300), petWorld(mon, null, 56), 56)).toBeNull()
    expect(dropOnLedge({ x: Number.NaN, y: 300, vx: 0, vy: 0 }, world, 56)).toBeNull()
    expect(dropOnLedge({ x: 1892, y: 300, vx: Number.NaN, vy: 0 }, world, 56)).toBeNull()
  })
})
