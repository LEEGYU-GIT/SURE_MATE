import { describe, expect, it } from 'vitest'
import type { MonitorInfo } from '../types'
import { petWorld } from './pet-world'
import { jumpVelocity, stepAir, throwVelocity, type AirContact, type Body } from './pet-physics'

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
