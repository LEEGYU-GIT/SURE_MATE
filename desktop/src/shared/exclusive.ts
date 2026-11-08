/**
 * 한 번에 하나만 실행한다. 실행 중에 또 부르면 실행하지 않고 busy()를 돌려준다.
 * 선택 글 가져오기와 붙여넣기는 클립보드를 같이 쓰므로 겹치면 원래 클립보드를 잃는다.
 */
export function createExclusive(): <T>(task: () => Promise<T>, busy: () => T) => Promise<T> {
  let running = false
  return async (task, busy) => {
    if (running) return busy()
    running = true
    try {
      return await task()
    } finally {
      running = false
    }
  }
}
