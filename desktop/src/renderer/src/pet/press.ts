export interface PressTracker {
  /** 펫 위에서 왼쪽 버튼을 눌렀다(pointerdown) */
  down(): void
  /** 뗐다(pointerup) */
  up(): void
  /** 포인터를 놓쳤다(pointercancel·lostpointercapture) */
  cancel(): void
  /** 창이 포커스를 잃었다(끄는 중 Alt+Tab 등) */
  blur(): void
}

/**
 * 누름·뗌을 main에 알린다. 눌린 상태일 때만 뗌(false)을 한 번 보내므로
 * pointerup 뒤에 따라오는 lostpointercapture나 blur가 뗌을 두 번 보내지 않고,
 * pointerup이 오지 않아도(창 밖에서 떼기·Alt+Tab) 펫이 커서에 붙어 남지 않는다.
 * 누름은 늘 보낸다: 누르는 중 창이 숨는 등으로 뗌·취소·blur가 오지 않으면 눌린 상태가 남는데(main은 버튼 조회로 이미 놓았다),
 * 그때 다음 누름을 삼키지 않게 한다(M6 최종 검토 M3). main은 누르는 중 다시 온 누름을 무시한다.
 */
export function createPressTracker(send: (down: boolean) => void): PressTracker {
  let pressed = false
  const release = (): void => {
    if (!pressed) return
    pressed = false
    send(false)
  }
  return {
    down() {
      pressed = true
      send(true)
    },
    up: release,
    cancel: release,
    blur: release
  }
}
