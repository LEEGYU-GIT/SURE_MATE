/**
 * Sure-Mate가 클립보드를 쓰는 일(가져오기·붙여넣기·프롬프트 쓰기)을 한 줄로 세운다.
 * 모든 일은 앞 가져오기의 "늦은 복사 지켜보기"가 끝난 뒤에 시작한다. 지켜보는 중에 우리가 글을 쓰면
 * 늦게 끝난 복사로 오해해 원래 클립보드로 되돌려 버리기 때문이다.
 */
export interface ClipboardGate {
  /** 다른 일이 하는 중이거나 기다리는 중이면 하지 않고 busy()를 돌려준다(가져오기·붙여넣기: 겹치면 원래 클립보드를 잃는다) */
  tryRun<T>(task: () => Promise<T>, busy: () => T): Promise<T>
  /** 앞 일이 끝날 때까지 기다렸다가 반드시 한다(프롬프트·되돌린 글 쓰기: 버리면 안 된다) */
  queue<T>(task: () => Promise<T>): Promise<T>
  /** 가져오기가 남긴 뒷정리(늦은 복사 지켜보기). 다음 일은 이것이 끝난 뒤에 시작한다 */
  settleAfter(p: Promise<void>): void
}

const noop = (): void => {}

export function createClipboardGate(): ClipboardGate {
  /** 하는 중이거나 기다리는 일의 수 */
  let pending = 0
  /** 마지막으로 줄 선 일이 끝나면 풀린다(실패해도) */
  let tail: Promise<void> = Promise.resolve()
  let settling: Promise<void> = Promise.resolve()

  const queue = <T>(task: () => Promise<T>): Promise<T> => {
    pending++
    const run = tail.then(async () => {
      await settling
      return task()
    })
    tail = run.then(noop, noop)
    return run.finally(() => {
      pending--
    })
  }

  return {
    tryRun: (task, busy) => (pending > 0 ? Promise.resolve(busy()) : queue(task)),
    queue,
    settleAfter(p) {
      settling = p.then(noop, noop)
    }
  }
}
