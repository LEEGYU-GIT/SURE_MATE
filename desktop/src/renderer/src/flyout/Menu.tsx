import { useId, type ReactNode } from 'react'
import type { FlyoutAction } from '../../../shared/flyout/flyout-content'
import { CheckIcon } from '../design/icons'
import { isChoiceRow, type MenuRow } from './menu-model'
import { press } from './press'

// 펼침 메뉴의 공통 모양(설계 §14-4). 표면·모서리·그림자는 Flyout이 그리고, 여기서는 안쪽만 그린다.
// - 안쪽 여백 4, 행 모서리 4(바 아이콘과 같은 마우스 올림·누름 바탕), 누를 때 움직임 없음. 메뉴 높이는 4의 배수.
// - 행 왼쪽 16 칸: 고르는 행은 지금 값에 체크, 명령 행은 아이콘. 머리 글은 이 칸에 맞춘다(팔레트 구역 머리와 같은 자리).
// - 글자: 머리 12/600, 행 제목 14(고른 값은 600), 설명 13. 흐린 글자는 --text-2(이 바탕에서 --text-3은 4.5:1 미만).

/**
 * 메뉴 틀(role menu, 안쪽 여백 4).
 * describedBy: 메뉴 항목이 아닌 안내 글(빈 목록 설명 등)의 id. menu 안의 일반 글은 화면 읽기 프로그램이 건너뛰므로 설명으로 잇는다.
 */
export function MenuBody({ label, describedBy, children }: { label: string; describedBy?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div role="menu" aria-label={label} aria-describedby={describedBy} className="flex flex-col p-1">
      {children}
    </div>
  )
}

export function MenuHeader({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div role="presentation" className="px-2 pt-2 pb-1 text-caption leading-4 font-semibold text-fg-2">
      {children}
    </div>
  )
}

/** 구분선: 높이 8 칸 가운데 1px --line(메뉴 높이가 4의 배수로 유지되게) */
export function MenuSeparator(): React.JSX.Element {
  return (
    <div role="separator" className="grid h-2 shrink-0 items-center px-2">
      <span className="block h-px bg-line" />
    </div>
  )
}

/**
 * 메뉴 한 행. 펼침 창은 포커스를 받지 않으므로 tabIndex -1(마우스만).
 * 설명이 있는 행은 두 줄(위아래 여백 8, 높이 52), 없는 행은 한 줄(높이 32).
 * 주황은 "지금 가명 처리가 꺼져 있음"에만 쓴다(바의 "끔" 표시·상태 줄·확인 화면과 같은 뜻): 위험한 값(tone 'warn')이
 * 지금 값일 때만 체크·설명·옅은 바탕이 주황이 되고, 고르지 않은 끔 행은 설명 글로만 알린다.
 * 옅은 주황 바탕은 8/12/14%까지만 써서 주황 설명 글이 흰 화면 위에서도 4.5:1 이상이다.
 */
export function MenuRowButton({ row, icon, onAction }: { row: MenuRow; icon?: ReactNode; onAction(a: FlyoutAction): void }): React.JSX.Element {
  const id = useId()
  const choice = isChoiceRow(row)
  const alert = row.checked && row.tone === 'warn'
  // 고르는 행이 아닌 warn 행(다른 모니터 구성)은 바탕은 그대로 두고 설명 글만 주황으로 한다(글이 항상 함께 있다)
  const warnDetail = alert || (!choice && row.tone === 'warn')
  const off = row.disabled === true
  let lead: ReactNode = null
  if (choice) lead = row.checked ? <CheckIcon size={16} className={alert ? 'text-warn' : 'text-brand'} /> : null
  else if (icon) lead = <span className="grid place-items-center text-fg-2">{icon}</span>
  return (
    <button
      type="button"
      tabIndex={-1}
      role={choice ? 'menuitemradio' : 'menuitem'}
      aria-checked={choice ? row.checked : undefined}
      // 이름은 제목, 설명은 한 줄 설명(화면 읽기 프로그램이 "끔, 원문 그대로 복사돼요"로 나눠 읽는다)
      aria-labelledby={`${id}-title`}
      aria-describedby={row.detail ? `${id}-detail` : undefined}
      aria-disabled={off || undefined}
      className={`grid w-full shrink-0 grid-cols-[16px_minmax(0,1fr)] gap-x-2 rounded-control px-2 text-left transition-colors duration-(--dur-hover) active:transition-none ${
        row.detail ? 'items-start py-2' : 'h-8 content-center items-center'
      } ${
        alert
          ? 'bg-warn/8 hover:bg-warn/12 active:bg-warn/14'
          : off
            ? 'cursor-default'
            : 'hover:bg-row-hover active:bg-row-selected'
      }`}
      // 뗄 때 고른다(press.ts: 숨겼던 펼침 창의 첫 누름이 사라져도 눌리게). 쓸 수 없는 행은 실행하지 않는다
      {...press(() => {
        if (!off) onAction(row.action)
      })}
    >
      <span aria-hidden="true" className="grid h-5 place-items-center">
        {lead}
      </span>
      <span id={`${id}-title`} className={`min-w-0 text-body leading-5 break-keep ${off ? 'text-fg-2' : 'text-fg'} ${row.checked ? 'font-semibold' : ''}`}>
        {row.title}
      </span>
      {row.detail ? (
        <span id={`${id}-detail`} className={`col-start-2 text-small leading-4 text-balance break-keep ${warnDetail ? 'text-warn' : 'text-fg-2'}`}>
          {row.detail}
        </span>
      ) : null}
    </button>
  )
}
