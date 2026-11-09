import { useId } from 'react'
import { PlusIcon, WorkspaceIcon } from '../design/icons'
import { MenuBody, MenuHeader, MenuSeparator } from './Menu'
import { MENU_TITLES } from './menu-model'

/**
 * 바의 워크스페이스 단추를 누르면 뜨는 목록.
 * 창 배치 저장·불러오기는 M7에서 들어온다. 그때까지는 이 기능이 무엇인지 알려 주는 빈 화면과
 * 쓸 수 없는 "지금 배치 저장"(준비 중)만 보인다. M7이 workspaces·canSave를 채우고 불러오기·저장 동작을 붙인다.
 */
export function WorkspaceMenu({ workspaces, canSave }: { workspaces: { id: string; name: string }[]; canSave: boolean }): React.JSX.Element {
  const emptyId = useId()
  const empty = workspaces.length === 0
  return (
    <MenuBody label={MENU_TITLES.workspace} describedBy={empty ? emptyId : undefined}>
      <MenuHeader>{MENU_TITLES.workspace}</MenuHeader>
      {empty ? (
        <div id={emptyId} className="px-2 pt-2 pb-2 break-keep">
          <p className="text-body leading-5 text-fg">저장한 창 배치가 없어요</p>
          {/* 두 줄을 고르게 나눠 "불러올 수 있어요"처럼 한 덩어리인 말이 줄 끝에서 갈리지 않게 */}
          <p className="text-small leading-5 text-balance text-fg-2">창 배치를 저장해 두면 이름으로 한 번에 불러올 수 있어요</p>
        </div>
      ) : (
        workspaces.map((w) => (
          <div key={w.id} role="menuitem" aria-disabled="true" className="grid h-8 shrink-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-x-2 px-2">
            <WorkspaceIcon size={16} className="text-fg-2" />
            <span className="truncate text-body leading-5 text-fg">{w.name}</span>
          </div>
        ))
      )}
      <MenuSeparator />
      <button
        type="button"
        tabIndex={-1}
        role="menuitem"
        disabled={!canSave}
        aria-disabled={!canSave || undefined}
        className="grid h-8 w-full shrink-0 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2 rounded-control px-2 text-left text-fg transition-colors duration-(--dur-hover) enabled:hover:bg-row-hover enabled:active:bg-row-selected enabled:active:transition-none disabled:cursor-default disabled:text-fg-3"
      >
        <PlusIcon size={16} />
        <span className="min-w-0 truncate text-body leading-5">지금 배치 저장</span>
        {canSave ? null : <span className="rounded-full border border-line px-2 text-caption leading-4 text-fg-2">준비 중</span>}
      </button>
    </MenuBody>
  )
}
