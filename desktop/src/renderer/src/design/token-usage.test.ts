import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 설계 문서 §14-4 완료 기준: 바·펼침 창 화면은 토큰 밖의 색·모서리 값을 쓰지 않는다.
const FORBIDDEN: { name: string; re: RegExp }[] = [
  { name: '16진수 색', re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: 'rgb()·rgba()', re: /\brgba?\(/ },
  { name: 'Tailwind 임의 16진수 색(-[#)', re: /-\[#/ },
  { name: 'Tailwind 임의 모서리(rounded-[)', re: /rounded-\[/ },
  {
    name: 'Tailwind 기본 팔레트 색',
    re: /\b(bg|text|border|ring|fill|stroke|from|via|to|shadow|outline|divide)-(white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/
  }
]

const violations = (text: string): string[] => FORBIDDEN.filter((f) => f.re.test(text)).map((f) => f.name)

const src = fileURLToPath(new URL('../', import.meta.url))
const FOLDERS = ['bar', 'flyout'].map((f) => join(src, f)).filter((dir) => existsSync(dir))

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return tsxFiles(path)
    return name.endsWith('.tsx') ? [path] : []
  })
}

describe('바·펼침 창 화면은 §14-4 토큰만 쓴다', () => {
  it('검사 대상이 비어 있지 않다(바 화면 Bar.tsx 포함)', () => {
    const files = FOLDERS.flatMap(tsxFiles)
    expect(files.some((f) => f.endsWith(join('bar', 'Bar.tsx')))).toBe(true)
  })

  it('16진수·rgb 색, 임의 색·모서리, Tailwind 기본 팔레트 색이 없다', () => {
    for (const file of FOLDERS.flatMap(tsxFiles)) {
      const text = readFileSync(file, 'utf8')
      expect(violations(text), file).toEqual([])
    }
  })

  it('검사 규칙: 토큰 밖 값은 잡고 토큰 유틸리티와 비슷한 이름은 통과시킨다', () => {
    for (const bad of ['color: #1B1E26', 'rgba(0, 0, 0, 0.2)', 'rgb(1 2 3)', 'bg-[#fff]', 'rounded-[3px]', 'bg-white/20', 'text-red-500', 'border-black', 'shadow-black/40', 'to-sky-400']) {
      expect(violations(bad), bad).not.toEqual([])
    }
    for (const ok of ['whitespace-nowrap', 'text-fg', 'text-fg-3', 'bg-surface-bar', 'border-line', 'rounded-control', 'rounded-full', 'bg-row-hover', 'text-warn', "href='#/bar'", 'var(--brand)']) {
      expect(violations(ok), ok).toEqual([])
    }
  })
})
