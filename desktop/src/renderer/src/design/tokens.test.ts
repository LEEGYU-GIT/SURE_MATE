import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const css = read('./tokens.css')
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

it('창 안에 한 단 들어간 바탕(입력칸·사용 예·미리 보기)은 --surface-inset 토큰이고, Tailwind에서는 bg-surface-inset', () => {
  expect(token('--surface-inset')).toBe('rgba(0,0,0,0.20)')
  expect(read('../assets/tailwind.css')).toMatch(/--color-surface-inset:\s*var\(--surface-inset\);/)
})

it('팔레트 화면은 토큰 밖의 색(bg-black/20 같은 Tailwind 기본 색)을 쓰지 않는다(설계 문서 §14-4 완료 기준)', () => {
  const tailwindColor = /\b(?:bg|text|border|ring|outline|fill|stroke)-(?:black|white|(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/
  const files = readdirSync(fileURLToPath(new URL('../palette/', import.meta.url))).filter((f) => f.endsWith('.tsx'))
  expect(files).toContain('Confirm.tsx')
  for (const file of files) expect(read(`../palette/${file}`), file).not.toMatch(tailwindColor)
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
