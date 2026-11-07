import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

let dir: string | null = null

/**
 * logs/YYYY-MM-DD.log에 JSON 한 줄씩 남긴다.
 * 선택한 글·클립보드 내용은 넣지 말 것(길이만).
 */
export function log(event: string, data: Record<string, unknown> = {}): void {
  try {
    if (!dir) {
      dir = join(app.getPath('userData'), 'logs')
      mkdirSync(dir, { recursive: true })
    }
    const now = new Date()
    const day = now.toLocaleDateString('sv-SE') // 로컬 날짜 YYYY-MM-DD
    appendFileSync(join(dir, `${day}.log`), JSON.stringify({ t: now.toISOString(), event, ...data }) + '\n')
  } catch {
    // 로그 실패로 앱이 멈추면 안 된다
  }
}
