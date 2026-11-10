import { describe, expect, it } from 'vitest'
import { assignWindows } from './match'
import type { LiveWindow } from './match'
import type { WindowRule } from './types'

const rule = (id: string, order: number, match: WindowRule['match'], savedTitle = '', enabled = true): WindowRule => ({
  id, enabled, match, savedTitle, order,
  target: { monitor: 'm', rect: { x: 0, y: 0, w: 1, h: 1 }, state: 'normal' }
})
const lw = (hwnd: string, exe: string, title: string, className = 'Cls'): LiveWindow => ({
  hwnd, exe, className, title, minimized: false, maximized: false, elevated: false
})
const ids = (m: Map<string, LiveWindow>): Record<string, string> =>
  Object.fromEntries([...m].map(([k, v]) => [k, v.hwnd]))

describe('assignWindows', () => {
  const rules = [
    rule('r1', 0, { exe: 'EXCEL.EXE', className: 'XLMAIN', titleIncludes: '가상자동차 보고서.xlsx' }),
    rule('r2', 1, { exe: 'EXCEL.EXE', className: 'XLMAIN', titleIncludes: '예산.xlsx' }),
    rule('r3', 2, { exe: 'Code.exe', className: 'Cls' })
  ]
  it('제목 조건이 없는 창으로 대신하지 않는다', () => {
    const m = assignWindows(rules, [
      lw('a', 'EXCEL.EXE', '예산.xlsx - Excel', 'XLMAIN'),
      lw('b', 'EXCEL.EXE', '기타.xlsx - Excel', 'XLMAIN'),
      lw('c', 'Code.exe', 'x - Visual Studio Code')
    ])
    expect(ids(m)).toEqual({ r2: 'a', r3: 'c' })
  })
  it('제목 규칙이 exe만 있는 규칙보다 먼저 가져간다', () => {
    const m = assignWindows(
      [rule('plain', 0, { exe: 'EXCEL.EXE' }), rule('titled', 5, { exe: 'EXCEL.EXE', titleIncludes: '예산' })],
      [lw('a', 'EXCEL.EXE', '기타 - Excel'), lw('b', 'EXCEL.EXE', '예산 - Excel')]
    )
    expect(ids(m)).toEqual({ titled: 'b', plain: 'a' })
  })
  it('같은 제목 창을 먼저 고른다', () => {
    const rs = [
      rule('a', 0, { exe: 'notepad.exe' }, '메모 - Windows 메모장'),
      rule('b', 1, { exe: 'notepad.exe' }, '제목 없음 - Windows 메모장')
    ]
    const m = assignWindows(rs, [lw('1', 'notepad.exe', '제목 없음 - Windows 메모장'), lw('2', 'notepad.exe', '메모 - Windows 메모장')])
    expect(ids(m)).toEqual({ a: '2', b: '1' })
  })
  it('제목이 같은 창이 없으면 z-순서', () => {
    const m = assignWindows([rule('a', 0, { exe: 'n.exe' }, 'zzz')], [lw('1', 'n.exe', 'x'), lw('2', 'n.exe', 'y')])
    expect(ids(m)).toEqual({ a: '1' })
  })
  it('exe 대소문자 무시, className 다르면 후보 아님', () => {
    expect(ids(assignWindows([rule('a', 0, { exe: 'excel.exe' })], [lw('1', 'EXCEL.EXE', 't')]))).toEqual({ a: '1' })
    expect(ids(assignWindows([rule('a', 0, { exe: 'a.exe', className: 'X' })], [lw('1', 'a.exe', 't', 'Y')]))).toEqual({})
  })
  it('titleRegex', () => {
    const m = assignWindows(
      [rule('a', 0, { exe: 'EXCEL.EXE', titleRegex: '^가상자동차' })],
      [lw('1', 'EXCEL.EXE', '예산 - Excel'), lw('2', 'EXCEL.EXE', '가상자동차 보고서.xlsx - Excel')]
    )
    expect(ids(m)).toEqual({ a: '2' })
  })
  it('잘못된 정규식은 맞지 않는다', () => {
    expect(assignWindows([rule('a', 0, { exe: 'a.exe', titleRegex: '(' })], [lw('1', 'a.exe', 't')]).size).toBe(0)
  })
  it('창 하나는 규칙 하나에만', () => {
    const m = assignWindows([rule('a', 0, { exe: 'a.exe' }), rule('b', 1, { exe: 'a.exe' })], [lw('1', 'a.exe', 't')])
    expect(ids(m)).toEqual({ a: '1' })
  })
  it('제목 대소문자·전각 접기', () => {
    const m = assignWindows([rule('a', 0, { exe: 'a.exe', titleIncludes: 'SUREMATE' })], [lw('1', 'a.exe', 'suremate-ws-a')])
    expect(ids(m)).toEqual({ a: '1' })
  })
})
