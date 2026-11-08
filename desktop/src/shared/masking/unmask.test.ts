import { expect, it } from 'vitest'
import { MappingTable } from './mapping-table'
import { unmaskText } from './unmask'

const never = (): boolean => false
const table = (): MappingTable => {
  const t = new MappingTable({ now: () => 0, ttlMs: 1e9 })
  t.tokenFor('client', 'client:g', '가상자동차', never)
  t.tokenFor('client', 'client:x', 'XY방산', never)
  t.tokenFor('ip', 'ip:10.0.3.15', '10.0.3.15', never)
  return t
}

it('토큰을 원래 이름으로 되돌리고 조사도 이름에 맞게 고친다', () => {
  expect(unmaskText('CLIENT_A에서 받은 SRS를 CLIENT_B는 IP_1의 서버에 올림', table())).toEqual({
    text: '가상자동차에서 받은 SRS를 XY방산은 10.0.3.15의 서버에 올림',
    restored: 3,
    unknownTokens: []
  })
})

it('AI가 바꿔 쓴 모양도 되돌린다(대소문자, 공백, _·-, 괄호)', () => {
  for (const v of ['Client_A', 'CLIENT A', '[CLIENT_A]', 'client-a', '(CLIENT_A)', '[ CLIENT_A ]', 'CLIENTA']) {
    expect(unmaskText(`${v}와 협의`, table()).text, v).toBe('가상자동차와 협의')
  }
  expect(unmaskText('ip-1과 연결', table()).text).toBe('10.0.3.15와 연결')
})

it('대응표에 없는 토큰은 그대로 두고 한 번씩 알린다', () => {
  expect(unmaskText('CLIENT_C와 CLIENT_C, PATH_9', table())).toEqual({
    text: 'CLIENT_C와 CLIENT_C, PATH_9',
    restored: 0,
    unknownTokens: ['CLIENT_C', 'PATH_9']
  })
})

it('CLIENT_AB를 CLIENT_A로 잘못 읽지 않는다', () => {
  const r = unmaskText('CLIENT_AB 담당', table())
  expect(r.text).toBe('CLIENT_AB 담당')
  expect(r.unknownTokens).toEqual(['CLIENT_AB'])
})

it('문장 속 "IP 1개"는 토큰으로 보지 않는다', () => {
  expect(unmaskText('IP 1개를 할당', table())).toEqual({ text: 'IP 1개를 할당', restored: 0, unknownTokens: [] })
})

it('괄호가 한쪽만 있으면 괄호는 그대로 둔다', () => {
  expect(unmaskText('(CLIENT_A 담당)', table()).text).toBe('(가상자동차 담당)')
})
