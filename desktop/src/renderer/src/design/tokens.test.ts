import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')
const token = (name: string): string | undefined => new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`).exec(css)?.[1].replace(/\s+/g, '')

it('설계 문서 §14-4 색 토큰', () => {
  expect(token('--ink')).toBe('#1B1E26')
  expect(token('--surface-bar')).toBe('rgba(30,33,42,0.94)')
  expect(token('--surface-flyout')).toBe('rgba(40,44,56,0.96)')
  expect(token('--surface-palette-solid')).toBe('#1E212A')
  expect(token('--surface-palette')).toBeDefined()
  expect(token('--text-1')).toBe('#F1F3F8')
  expect(token('--text-2')).toBe('#C9D0DD')
  expect(token('--text-3')).toBe('#8A93A6')
  expect(token('--line')).toBe('rgba(255,255,255,0.10)')
  expect(token('--brand')).toBe('#3CC8B4')
  expect(token('--brand-strong')).toBe('#2A9D8F')
  expect(token('--highlight')).toBe('#FFD447')
  expect(token('--warn')).toBe('#F59E3D')
  expect(token('--danger')).toBe('#FF6B6B')
  expect(token('--cheek')).toBe('#FF8FA3')
  expect(token('--lens')).toBe('#BFF3EC')
  expect(token('--mist')).toBe('#E8ECF2')
})

it('모서리와 글자 크기 토큰', () => {
  expect(token('--radius-window')).toBe('8px')
  expect(token('--radius-control')).toBe('4px')
  expect(token('--fs-caption')).toBe('12px')
  expect(token('--fs-small')).toBe('13px')
  expect(token('--fs-body')).toBe('14px')
  expect(token('--fs-input')).toBe('16px')
  expect(token('--fs-title')).toBe('20px')
})

it('Pretendard를 앱 안의 파일로 불러온다(외부 주소 없음)', () => {
  expect(css).toMatch(/@font-face\s*{[^}]*Pretendard Variable[^}]*url\(['"]?\.\.\/assets\/fonts\/PretendardVariable\.woff2/)
  expect(css).not.toMatch(/https?:\/\//)
})
