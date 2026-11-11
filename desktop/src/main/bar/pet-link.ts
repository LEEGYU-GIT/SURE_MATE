import type { BarWindowPort } from './bar-controller'

/*
 * 바 런타임이 말랑 메이트에 알리는 고리(설계 §14-2). 펫 쪽 오류가 바 동작을 멈추지 않게 모두 삼킨다
 * (펫 런타임이 자기 오류를 기록한다).
 */

/** 던져도 삼킨다 */
export function safely(fn: () => void): void {
  try {
    fn()
  } catch {
    // 펫 쪽 오류: 바는 하던 일을 이어 간다
  }
}

/**
 * 전체 화면 감시의 바뀜을 바와 펫에 순서대로 알린다. 켜질 때는 펫이 바보다 먼저 숨고, 꺼질 때는 바가 나온 다음 펫이 나온다.
 * 숨은 펫은 세계를 읽지 않으므로 바가 숨은 중간 세계를 보지 않고, 돌아와서 바 꼭대기의 앉은 자리를 지킨다(Review Focus 2)
 */
export function fullscreenInOrder(o: { bar(on: boolean): void; pet(on: boolean): void }): (on: boolean) => void {
  return (on) => {
    if (on) {
      safely(() => o.pet(true))
      o.bar(true)
    } else {
      o.bar(false)
      safely(() => o.pet(false))
    }
  }
}

/** 맨 앞 순서: 바 → (보이면) 펼침 창 → 펫(설계 §14-2 "펫은 늘 바보다 앞") */
export function raiseInOrder(o: { bar(): void; flyout: { visible(): boolean; raise(): void }; after(): void }): () => void {
  return () => {
    o.bar()
    if (o.flyout.visible()) o.flyout.raise()
    safely(() => o.after())
  }
}

/**
 * 바 창 포트에 펫 알림을 단다: 놓기(끌기·자동 숨김의 창 크기·모양·모니터), 보이기·숨기기(끄기·잠시 숨김·전체 화면),
 * 바 화면 보내기(자동 숨김으로 접힘·펼침) 뒤마다 changed를 부른다. 바가 동기로 바꾸는 순서 중간에도 불리므로
 * 받는 쪽(펫 런타임)이 묶어서 다음 차례에 읽는다
 */
export function linkBarPort(port: BarWindowPort, changed: () => void): BarWindowPort {
  return {
    setBounds: (r) => {
      port.setBounds(r)
      safely(changed)
    },
    getBounds: () => port.getBounds(),
    showInactive: () => {
      port.showInactive()
      safely(changed)
    },
    hide: () => {
      port.hide()
      safely(changed)
    },
    send: (s) => {
      port.send(s)
      safely(changed)
    }
  }
}
