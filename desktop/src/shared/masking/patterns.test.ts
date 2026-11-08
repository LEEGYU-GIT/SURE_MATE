import { expect, it } from 'vitest'
import { findPatterns } from './patterns'

const found = (text: string, internalDomains: string[] = []): [string, string][] =>
  findPatterns(text, { internalDomains }).map((d) => [d.category, d.original])

it('IP: 옥텟·CIDR·포트를 검사한다', () => {
  expect(found('서버 10.0.3.15에 접속')).toEqual([['ip', '10.0.3.15']])
  expect(found('대역 192.168.0.1/24 사용')).toEqual([['ip', '192.168.0.1/24']])
  expect(found('주소 10.1.2.3:8080 열림')).toEqual([['ip', '10.1.2.3:8080']])
  expect(found('문장 끝 10.0.3.15.')).toEqual([['ip', '10.0.3.15']])
  expect(found('10.0.0.1/33')).toEqual([['ip', '10.0.0.1']])
  expect(found('10.1.2.3:99999')).toEqual([['ip', '10.1.2.3']])
  for (const no of ['999.1.1.1', '1.2.3', 'v1.2.3.4', '1.2.3.4.5']) expect(found(no), no).toEqual([])
})

it('경로: 드라이브·UNC·따옴표 안 공백, 뒤에 붙은 조사는 뺀다', () => {
  expect(found('파일 C:\\work\\a.txt 확인')).toEqual([['path', 'C:\\work\\a.txt']])
  expect(found('공유 \\\\fs01\\proj\\x 폴더')).toEqual([['path', '\\\\fs01\\proj\\x']])
  expect(found('설치 "C:\\Program Files\\App" 아래')).toEqual([['path', 'C:\\Program Files\\App']])
  expect(found('\\\\fs01\\proj에 올림')).toEqual([['path', '\\\\fs01\\proj']])
  expect(found('C:\\업무\\보고서.docx에서 확인')).toEqual([['path', 'C:\\업무\\보고서.docx']])
  expect(found('C:\\업무\\보고서 열기')).toEqual([['path', 'C:\\업무\\보고서']])
  expect(found('a\\b')).toEqual([])
})

it('이메일', () => {
  expect(found('kim@corp.example로 보내 주세요')).toEqual([['email', 'kim@corp.example']])
})

it('전화번호(010, 02, 0xx, 070, 15xx, +82)와 날짜는 구별한다', () => {
  for (const p of ['010-1234-5678', '01012345678', '02-123-4567', '031-123-4567', '070-1234-5678', '1588-1234', '+82 10 1234 5678', '+82-10-1234-5678']) {
    expect(found(`연락처 ${p} 입니다`), p).toEqual([['phone', p]])
  }
  for (const no of ['2026-11-08', '1234-5678', '15881234', '주문번호 0311234567']) expect(found(no), no).toEqual([])
})

it('사내 URL은 설정한 도메인만', () => {
  expect(found('위키 https://wiki.intra.example/a/b 참고', ['intra.example'])).toEqual([['url', 'https://wiki.intra.example/a/b']])
  expect(found('wiki.intra.example에 접속', ['intra.example'])).toEqual([['url', 'wiki.intra.example']])
  expect(found('https://claude.ai 열기', ['intra.example'])).toEqual([])
  expect(found('https://wiki.intra.example', [])).toEqual([])
  expect(found('notintra.example', ['intra.example'])).toEqual([])
})

it('겹치면 먼저 시작한 것(이메일 안의 사내 도메인은 이메일 하나로)', () => {
  expect(found('kim@intra.example', ['intra.example'])).toEqual([['email', 'kim@intra.example']])
})

it('같은 대상은 같은 키(전화번호는 숫자만, 경로·이메일은 소문자)', () => {
  const keys = (text: string): string[] => findPatterns(text, { internalDomains: [] }).map((d) => d.key)
  expect(keys('010-1234-5678 / 01012345678')).toEqual(['phone:01012345678', 'phone:01012345678'])
  expect(keys('C:\\Work\\A.txt c:\\work\\a.txt')).toEqual(['path:c:\\work\\a.txt', 'path:c:\\work\\a.txt'])
  expect(keys('Kim@Corp.example')).toEqual(['email:kim@corp.example'])
})

it('시작 위치 순으로, 원문 자리를 정확히', () => {
  const text = '10.0.3.15 그리고 kim@corp.example'
  const ds = findPatterns(text, { internalDomains: [] })
  expect(ds.map((d) => text.slice(d.start, d.end))).toEqual(['10.0.3.15', 'kim@corp.example'])
})
