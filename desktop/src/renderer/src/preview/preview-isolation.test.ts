import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { SCENES } from './scenes'

const root = resolve(__dirname, '../../../..')

describe('개발용 미리 보기 격리', () => {
  it.each(['src/renderer/src/App.tsx', 'src/renderer/src/main.tsx', 'electron.vite.config.ts'])(
    '%s 는 미리 보기를 참조하지 않는다',
    (file) => {
      expect(readFileSync(resolve(root, file), 'utf8')).not.toContain('preview')
    }
  )

  it('장면 id 는 서로 다르고 소문자·숫자·하이픈만 쓴다', () => {
    const ids = SCENES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('status-bar 장면이 있다', () => {
    expect(SCENES.some((s) => s.id === 'status-bar')).toBe(true)
  })
})
