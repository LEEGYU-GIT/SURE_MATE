import { appendFileSync, mkdirSync } from 'node:fs'
import { readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { logsToDelete, shouldCleanNow } from './log-retention'

let dir: string | null = null
let lastCleanDay: string | null = null

/**
 * 7일보다 오래된 로그 파일을 비동기로 지운다(logs 폴더 안, `YYYY-MM-DD.log`만).
 * 실패해도 던지지 않는다. 지운 개수만 `log.cleanup`으로 남긴다.
 */
async function cleanup(logsDir: string, today: string): Promise<void> {
  try {
    const names = await readdir(logsDir)
    let deleted = 0
    for (const name of logsToDelete(names, today)) {
      try {
        await unlink(join(logsDir, name)) // 이름은 정규식을 통과해 경로 구분자가 없다
        deleted += 1
      } catch {
        // 잠긴 파일은 다음 날 다시 시도한다
      }
    }
    log('log.cleanup', { deleted })
  } catch {
    // 정리 실패로 앱이 멈추면 안 된다
  }
}

/**
 * logs/YYYY-MM-DD.log에 JSON 한 줄씩 남긴다.
 * 선택한 글·클립보드 내용은 넣지 말 것(길이만).
 * 오래된 파일 정리는 폴더를 처음 만들 때와 로컬 날짜가 바뀔 때 한 번씩, 기록한 뒤에 시작한다.
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
    if (shouldCleanNow(lastCleanDay, day)) {
      lastCleanDay = day // 먼저 표시해 정리 중 남기는 log.cleanup이 다시 정리를 시작하지 않게 한다
      void cleanup(dir, day)
    }
  } catch {
    // 로그 실패로 앱이 멈추면 안 된다
  }
}
