import { useEffect, useMemo, useState } from 'react'
import { PET_WINDOW, type PetView } from '../../../shared/pet/pet-view'
import { faceTarget } from './bubble-box'
import { MALLANG } from './character'
import { PetBubble } from './PetBubble'
import { PetMenu } from './PetMenu'
import { createKeyTracker } from './pet-keys'
import { createPressTracker } from './press'
import { PetSprite } from './PetSprite'

/** 말풍선 꼬리가 가리킬 얼굴 가운데(창 좌표). 펫이 없으면 창 가운데 */
function bubbleTarget(view: PetView | null): { x: number; y: number } {
  if (!view) return { x: PET_WINDOW.width / 2, y: PET_WINDOW.height / 2 }
  const { pose, facing } = view.look
  return faceTarget({ box: view.box, size: view.size, place: MALLANG.face(pose), mirror: facing === 'left' })
}

/**
 * #/pet 창(투명, PET_WINDOW 크기). main이 보낸 펫 화면 상태대로 view.box 자리에 펫을 그리고, 반응 말풍선과
 * 오른쪽 클릭 메뉴를 그 위에 띄운다. 창은 펫 모양·말풍선·메뉴 위에서만 마우스를 받는다(main이 커서를 조회해 클릭 통과를 끄고 켠다).
 * 누름·뗌·키는 main에 그대로 알리고 클릭·더블클릭·끌기·조종 판단은 main이 한다.
 */
export function Pet(): React.JSX.Element {
  const [view, setView] = useState<PetView | null>(null)
  const press = useMemo(() => createPressTracker((down) => window.sureMate.petPress(down)), [])

  useEffect(() => {
    let alive = true
    // 구독을 먼저 걸고 지금 상태를 묻는다. 그 사이 도착한 새 상태를 옛 응답으로 덮지 않는다.
    const off = window.sureMate.onPetView((v) => setView(v))
    window.sureMate
      .getPetView()
      .then((v) => {
        if (alive && v) setView((cur) => cur ?? v)
      })
      .catch(() => {
        // 펫 상태는 main이 다시 보낸다(onPetView). 여기서 할 일은 없다.
      })
    return () => {
      alive = false
      off()
    }
  }, [])

  // 누른 채 창이 포커스를 잃으면(조종 중 Alt+Tab 등) 뗀 것으로 알린다(Review Focus 4)
  useEffect(() => {
    const onBlur = (): void => press.blur()
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [press])

  // 조종 중에만 키를 받는다(설계 §14-2). 물리 키(e.code)로 읽어 한/영 상태와 무관하고, 처리한 키는 기본 동작을 막는다.
  // 자동 반복은 보내지 않고, 창이 포커스를 잃으면 누르고 있던 키를 뗀 것으로 알린다
  const controlling = view?.controlling ?? false
  useEffect(() => {
    if (!controlling) return
    const keys = createKeyTracker((k, down) => window.sureMate.petKey(k, down))
    const onKeyDown = (e: KeyboardEvent): void => {
      if (keys.down(e.code, e.repeat)) e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (keys.up(e.code)) e.preventDefault()
    }
    const onBlur = (): void => keys.blur()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [controlling])

  return (
    <div className="relative overflow-hidden" style={{ width: PET_WINDOW.width, height: PET_WINDOW.height }}>
      {view ? (
        <div
          className={`absolute touch-none ${view.look.pose === 'held' ? 'cursor-grabbing' : ''}`}
          style={{ left: view.box.x, top: view.box.y, width: view.size, height: view.size }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            press.down()
          }}
          onPointerUp={() => press.up()}
          onPointerCancel={() => press.cancel()}
          onLostPointerCapture={() => press.cancel()}
          onContextMenu={(e) => {
            e.preventDefault()
            window.sureMate.petContextMenu()
          }}
        >
          <PetSprite look={view.look} size={view.size} reduceMotion={view.reduceMotion} />
        </div>
      ) : null}
      {/* 알림 영역은 늘 둔다(화면 읽기 프로그램이 새 말풍선을 읽게). 말풍선은 펫 앞에 그린다 */}
      <PetBubble bubble={view?.bubble ?? null} target={bubbleTarget(view)} reduceMotion={view?.reduceMotion ?? false} />
      {view?.menu ? <PetMenu menu={view.menu} reduceMotion={view.reduceMotion} onAction={(a) => window.sureMate.petMenu(a)} /> : null}
    </div>
  )
}
