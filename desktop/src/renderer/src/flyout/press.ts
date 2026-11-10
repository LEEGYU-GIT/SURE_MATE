/** 뗌으로 실행한 뒤 이 시간 안에 오는 click은 같은 누름의 click이라 건너뛴다 */
export const PRESS_CLICK_AFTER_UP_MS = 500

export interface PressHandlers {
  onPointerUp(e: { button: number }): void
  onClick(): void
}

/**
 * 펼침 창 단추는 누름이 아니라 뗌(pointerup)으로 실행한다(Windows 메뉴처럼 놓을 때 고른다).
 * 까닭: 포커스를 받지 않는 펼침 창을 누른 직후 숨기면, 그 뒤 이 창의 첫 누름(WM_LBUTTONDOWN)이 가끔 오지 않고
 * 뗌만 와서 click이 생기지 않았다(t18 스모크, 2026-11-10, 화면 밖으로 옮기는 0.3초 지연 뒤에도 약 40번에 1번).
 * 뗌 없이 오는 click(화면 읽기 프로그램·자동화가 단추를 실행)도 받는다. 펼침 창 단추가 같은 시계를 나눠 쓰므로
 * 한 번의 누름이 두 번 실행되지 않는다.
 */
export function createPress(now: () => number = () => performance.now()): (run: () => void) => PressHandlers {
  let lastUpAt = Number.NEGATIVE_INFINITY
  return (run) => ({
    onPointerUp(e) {
      if (e.button !== 0) return
      lastUpAt = now()
      run()
    },
    onClick() {
      if (now() - lastUpAt <= PRESS_CLICK_AFTER_UP_MS) return
      run()
    }
  })
}

/** 펼침 창 단추가 함께 쓰는 실행 처리기 */
export const press = createPress()
