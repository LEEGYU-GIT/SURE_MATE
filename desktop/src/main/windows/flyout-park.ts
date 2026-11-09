import type { Rect } from '../../shared/types'

/**
 * 숨긴 펼침 창을 두는 화면 밖 자리(DIP). 배율 400%에서도 물리 좌표가 -32000 안쪽이다.
 *
 * 펼침 창은 숨길 때 hide()하지 않는다. 화면에 '숨김'을 알려 내용을 바로 감추고(움직임 없음), PARK_DELAY_MS 뒤
 * 클릭 통과로 바꿔 보이는 채 여기로 옮긴다. 다시 보일 때(setBounds·showInactive) 옮기기를 취소하고 클릭 통과를 푼다.
 * 까닭: Windows에서 포커스를 받지 않는 창을 누른 직후 hide() → showInactive()를 하면, 그 뒤 이 창의 마우스 누름
 * (WM_LBUTTONDOWN)이 오지 않고 뗌만 와서 메뉴 행을 두 번째부터 누를 수 없었다(t18 스모크, 2026-11-09).
 * 누름 뒤 0.15초 지연 + hide, 포커스 막기, mouseLeave 보내기, 클릭 통과 + hide, 지연 없이 화면 밖으로 옮기기는 모두 그대로였고
 * hide 없이 0.15초 뒤 클릭 통과 + 화면 밖으로 옮길 때만 세 번 연속 눌렸다. 느린 PC를 생각해 0.3초를 둔다.
 * 그러니 이 창에 hide()를 되살리지 않는다.
 */
export const PARK = -8000
export const PARK_DELAY_MS = 300

/** 배율 화면에서 DIP ↔ 물리 픽셀 반올림으로 생기는 어긋남(DIP). 이 안이면 다시 옮기지 않는다(move 되먹임 방지) */
const PARK_TOLERANCE = 2

/** 창에 대해 필요한 동작(Electron 창을 감싼 쪽이 채운다) */
export interface ParkTarget {
  getBounds(): Rect
  setBounds(r: Rect): void
  setIgnoreMouseEvents(ignore: boolean): void
  isVisible(): boolean
  showInactive(): void
}

export interface FlyoutParker {
  /** 자리를 놓는다. 대기 중인 옮기기를 취소한다 */
  setBounds(r: Rect): void
  /** 클릭 통과를 풀고, 아직 안 보이면 처음 한 번만 실제로 띄운다 */
  showInactive(): void
  /** hide() 대신: PARK_DELAY_MS 뒤 클릭 통과로 바꾸고 화면 밖으로 옮긴다 */
  hide(): void
  /** 창이 움직였다(move). 옮겨 둔 동안 Windows가 안으로 옮겼으면 다시 내보낸다 */
  onMove(): void
  /** 화면 밖에 옮겨 두었는가(내용이 없는 창이라 '보임'으로 치지 않는다) */
  isParked(): boolean
  dispose(): void
}

export function createFlyoutParker(t: ParkTarget): FlyoutParker {
  let parked = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const park = (): void => {
    const b = t.getBounds()
    if (Math.abs(b.x - PARK) > PARK_TOLERANCE || Math.abs(b.y - PARK) > PARK_TOLERANCE) t.setBounds({ x: PARK, y: PARK, width: b.width, height: b.height })
  }
  return {
    setBounds(r) {
      cancel()
      parked = false
      t.setBounds(r)
    },
    showInactive() {
      cancel()
      parked = false
      t.setIgnoreMouseEvents(false)
      // 처음 한 번만 실제로 띄운다. 그 뒤로는 늘 보이는 채 자리(setBounds)만 바뀐다
      if (!t.isVisible()) t.showInactive()
    },
    hide() {
      cancel()
      timer = setTimeout(() => {
        timer = null
        parked = true
        t.setIgnoreMouseEvents(true)
        park()
      }, PARK_DELAY_MS)
    },
    onMove() {
      if (parked) park()
    },
    isParked: () => parked,
    dispose: cancel
  }
}
