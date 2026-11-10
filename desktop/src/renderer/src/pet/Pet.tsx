import { useEffect, useMemo, useState } from 'react'
import { PET_WINDOW, type PetView } from '../../../shared/pet/pet-view'
import { createPressTracker } from './press'
import { PetSprite } from './PetSprite'

/**
 * #/pet 창(투명, PET_WINDOW 크기). main이 보낸 펫 화면 상태대로 view.box 자리에 펫을 그린다.
 * 창은 펫 모양 위에서만 마우스를 받는다(main이 커서를 조회해 클릭 통과를 끄고 켠다).
 * 누름·뗌은 main에 그대로 알리고 클릭·더블클릭·끌기 판단은 main이 한다.
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
    </div>
  )
}
