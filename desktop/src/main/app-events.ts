import type { AppEvent, AppEvents } from '../shared/app-events'
import { log } from './log'

/**
 * 앱 일 전달 통로. 받는 쪽이 예외를 내도 나머지에 계속 전달하고, 예외는 일의 종류만 기록한다(글·이름 없음).
 * emit은 this 없이 넘겨도 된다(`emit: appEvents.emit`).
 */
export function createAppEvents(
  logEvent: (event: string, data: Record<string, unknown>) => void
): AppEvents {
  // 등록마다 따로 둔다: 같은 함수를 두 번 등록하면 두 번 받고, 해제는 하나씩
  const listeners = new Set<{ cb: (e: AppEvent) => void }>()
  return {
    emit(e) {
      // 받는 중에 등록한 쪽은 다음 일부터, 해제한 쪽은 이 일부터 받지 않는다
      for (const entry of [...listeners]) {
        if (!listeners.has(entry)) continue
        try {
          entry.cb(e)
        } catch {
          logEvent('app.events.listenerError', { type: e.type })
        }
      }
    },
    on(cb) {
      const entry = { cb }
      listeners.add(entry)
      return () => {
        listeners.delete(entry)
      }
    }
  }
}

/** 앱 전체 통로 하나: 프롬프트·가명 처리·위키 카드가 내보내고 말랑 메이트가 받는다 */
export const appEvents = createAppEvents(log)
