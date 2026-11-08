import { expect, it } from 'vitest'
import { letterSuffix, MappingTable } from './mapping-table'

const never = (): boolean => false

it('이름 분류 토큰은 A~Z 다음 AA, AB…', () => {
  expect([0, 1, 25, 26, 27, 51, 52].map(letterSuffix)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA'])
})

it('같은 키는 같은 토큰, 분류마다 따로 센다(이름은 글자, 패턴은 숫자)', () => {
  const t = new MappingTable({ now: () => 0, ttlMs: 1000 })
  expect(t.tokenFor('client', 'client:a', '가상자동차', never)).toBe('CLIENT_A')
  expect(t.tokenFor('client', 'client:b', 'XY방산', never)).toBe('CLIENT_B')
  expect(t.tokenFor('client', 'client:a', '가상자동차', never)).toBe('CLIENT_A')
  expect(t.tokenFor('ip', 'ip:10.0.3.15', '10.0.3.15', never)).toBe('IP_1')
  expect(t.tokenFor('person', 'person:p', '홍길동', never)).toBe('PERSON_A')
  expect(t.lookup('CLIENT_B')).toEqual({ original: 'XY방산', category: 'client' })
  expect(t.size()).toBe(4)
})

it('이미 쓰인 표시는 건너뛴다', () => {
  const t = new MappingTable({ now: () => 0, ttlMs: 1000 })
  expect(t.tokenFor('client', 'client:a', '가상자동차', (token) => token === 'CLIENT_A')).toBe('CLIENT_B')
})

it('fork한 표에서 받은 토큰은 원래 표에 남지 않고, 원래 표의 토큰은 이어서 쓴다', () => {
  const t = new MappingTable({ now: () => 0, ttlMs: 1000 })
  t.tokenFor('client', 'client:a', '가상자동차', never)
  const f = t.fork()
  expect(f.tokenFor('client', 'client:a', '가상자동차', never)).toBe('CLIENT_A')
  expect(f.tokenFor('client', 'client:b', 'XY방산', never)).toBe('CLIENT_B')
  expect(t.size()).toBe(1)
  expect(t.lookup('CLIENT_B')).toBeUndefined()
})

it('마지막으로 쓴 뒤 ttl이 지나면 비우되, 켜 둔 동안은 쓴 글자를 다시 쓰지 않는다(옛 답에 다른 이름이 들어가지 않게)', () => {
  let now = 0
  const t = new MappingTable({ now: () => now, ttlMs: 1000 })
  t.tokenFor('client', 'client:b', 'XY방산', never)
  now = 900
  expect(t.lookup('CLIENT_A')?.original).toBe('XY방산')
  now = 1800 // 마지막 사용(900)에서 900ms 뒤라 아직 살아 있다
  expect(t.tokenFor('client', 'client:a', '가상자동차', never)).toBe('CLIENT_B')
  now = 3000
  expect(t.tokenFor('client', 'client:x', '다른 고객사', never)).toBe('CLIENT_C')
  expect(t.lookup('CLIENT_A')).toBeUndefined()
  expect(t.lookup('CLIENT_B')).toBeUndefined()
  // 직접 비워도 같다
  t.clear()
  expect(t.tokenFor('client', 'client:y', '또 다른 고객사', never)).toBe('CLIENT_D')
})
