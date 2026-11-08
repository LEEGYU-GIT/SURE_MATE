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

it('AI가 바꿔 쓴 모양도 되돌린다(대소문자, 공백, _·-, 대괄호)', () => {
  for (const v of ['Client_A', 'CLIENT A', '[CLIENT_A]', 'client-a', '[ CLIENT_A ]', 'CLIENTA']) {
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

it('되돌린 이름 뒤 겹조사도 고친다(§8 완료 기준: 이름과 조사까지)', () => {
  expect(unmaskText('CLIENT_B와의 회의, CLIENT_B로부터 받은 자료', table()).text).toBe('XY방산과의 회의, XY방산으로부터 받은 자료')
})

it('소괄호는 진짜 괄호 설명이라 남기고 안의 토큰만 되돌린다(대괄호는 벗긴다)', () => {
  expect(unmaskText('고객사(CLIENT_A)와 협의', table()).text).toBe('고객사(가상자동차)와 협의')
  expect(unmaskText('(CLIENT_A)와 협의', table()).text).toBe('(가상자동차)와 협의')
})

it('코드 속 변수(path1, ip1, client_id)와 영어 낱말(client is, CLIENTS)은 토큰으로 보지 않는다', () => {
  for (const s of ['path1 = os.path.join(base, name)', 'for ip1 in hosts:', 'client_id = 3', 'the client is ready', 'project of record', 'OUR CLIENTS']) {
    expect(unmaskText(s, table()), s).toEqual({ text: s, restored: 0, unknownTokens: [] })
  }
  // 대문자로 붙여 쓴 패턴 토큰은 되돌린다
  expect(unmaskText('IP1에 접속', table()).text).toBe('10.0.3.15에 접속')
})

it('문장 속 "IP 1개"는 토큰으로 보지 않는다', () => {
  expect(unmaskText('IP 1개를 할당', table())).toEqual({ text: 'IP 1개를 할당', restored: 0, unknownTokens: [] })
})

it('괄호가 한쪽만 있으면 괄호는 그대로 둔다', () => {
  expect(unmaskText('(CLIENT_A 담당)', table()).text).toBe('(가상자동차 담당)')
})
