import { useId } from 'react'
import type { PetMenuAction, PetMenuRow, PetView } from '../../../shared/pet/pet-view'
import { EyeOffIcon, GamepadIcon, MoonIcon, SettingsIcon, SunIcon } from '../design/icons'
import { MenuBody } from '../flyout/Menu'

type PetMenuView = NonNullable<PetView['menu']>

/** 행 아이콘(16, --text-2). 숨기기·설정은 바 메뉴의 "30분 동안 숨기기"·"설정 열기"와 같은 아이콘 */
const ICONS: Record<PetMenuAction, (p: { size?: number }) => React.JSX.Element> = {
  control: GamepadIcon,
  sleep: MoonIcon,
  wake: SunIcon,
  hide: EyeOffIcon,
  settings: SettingsIcon
}

/**
 * 말랑 메이트 오른쪽 클릭 메뉴(설계 §14-2). Windows 메뉴 대신 펫 창 안에 직접 그린다(포커스를 받지 않고 토큰 디자인 유지).
 * M5 펼침 메뉴와 같은 가족: --surface-flyout 표면·1px --line 테두리·모서리 8·--shadow-flyout, 안쪽 여백 4, 한 줄 행 32.
 * 자리(rect, 창 좌표)와 행은 main이 정한다(메뉴 크기 176×136 = menuSize(4)). 표면·테두리·그림자는 덧그린 판이라
 * 크기에 더하지 않는다(펼침 창과 같은 방법). 들어올 때만 펫 쪽에서 4 DIP·투명도 200ms --ease-out, 닫힐 때는 움직임 없음.
 */
export function PetMenu({
  menu,
  reduceMotion,
  onAction
}: {
  menu: PetMenuView
  reduceMotion: boolean
  onAction(a: PetMenuAction): void
}): React.JSX.Element {
  const { rect, side, rows } = menu
  return (
    <div
      className="pet-menu absolute isolate"
      data-side={side}
      data-reduce-motion={reduceMotion ? '' : undefined}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-window shadow-[var(--shadow-flyout)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-window border border-line bg-surface-flyout"
      />
      <MenuBody label="말랑 메이트">
        {rows.map((row) => (
          <PetMenuItem key={row.action} row={row} onAction={onAction} />
        ))}
      </MenuBody>
    </div>
  )
}

/**
 * 한 줄 명령 행(높이 32): 아이콘 칸 16 + 제목 14. M5 메뉴의 명령 행(MenuRowButton)과 같은 모양·마우스 올림·누름 바탕.
 * 펫 창은 포커스를 받지 않으므로 tabIndex -1(마우스만). 설명(키 안내·다시 부르는 곳)은 행 높이에 들어가지 않아
 * 화면 읽기 프로그램에만 준다(조종 키는 조종을 시작할 때 말풍선으로 보인다).
 */
function PetMenuItem({
  row,
  onAction
}: {
  row: PetMenuRow
  onAction(a: PetMenuAction): void
}): React.JSX.Element {
  const id = useId()
  const Icon = ICONS[row.action]
  return (
    <button
      type="button"
      tabIndex={-1}
      role="menuitem"
      aria-labelledby={`${id}-title`}
      aria-describedby={row.detail ? `${id}-detail` : undefined}
      className="grid h-8 w-full shrink-0 grid-cols-[16px_minmax(0,1fr)] content-center items-center gap-x-2 rounded-control px-2 text-left transition-colors duration-(--dur-hover) hover:bg-row-hover active:bg-row-selected active:transition-none"
      onClick={() => onAction(row.action)}
    >
      <span aria-hidden="true" className="grid h-5 place-items-center text-fg-2">
        <Icon size={16} />
      </span>
      <span id={`${id}-title`} className="min-w-0 truncate text-body leading-5 text-fg">
        {row.title}
      </span>
      {row.detail ? (
        <span id={`${id}-detail`} className="sr-only">
          {row.detail}
        </span>
      ) : null}
    </button>
  )
}
