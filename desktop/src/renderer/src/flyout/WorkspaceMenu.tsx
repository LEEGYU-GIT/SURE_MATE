import { useId } from 'react'
import type { FlyoutAction, FlyoutContent } from '../../../shared/flyout/flyout-content'
import { PlusIcon, SettingsIcon, WorkspaceIcon } from '../design/icons'
import { MenuBody, MenuHeader, MenuRowButton, MenuSeparator } from './Menu'
import { MENU_TITLES, workspaceMenuRows } from './menu-model'

/** 명령 행 아이콘(저장은 +, 모두 보기·편집은 설정 아이콘, 불러오기는 워크스페이스 아이콘) */
const ICONS: Record<'workspace-run' | 'workspace-save' | 'workspace-edit', React.JSX.Element> = {
  'workspace-run': <WorkspaceIcon size={16} />,
  'workspace-save': <PlusIcon size={16} />,
  'workspace-edit': <SettingsIcon size={16} />
}

/**
 * 바의 워크스페이스 단추를 누르면 뜨는 메뉴: 저장한 배치(불러오기) | 지금 배치 저장 | 모두 보기·편집.
 * 다른 모니터 구성에서 저장한 배치는 설명에 글로 적고 주황으로도 알린다. Win32를 못 쓰면 저장 행은 글로 까닭을 적고 쓸 수 없다.
 * 저장한 배치는 main이 카드 높이에 들어가는 만큼만 보내고(나머지는 "외 N개"), 이름은 한 줄로 줄인다(행 높이 52 그대로).
 * 저장한 배치가 하나도 없으면 머리 아래에 안내를 두고 저장·편집 두 행만 남긴다.
 */
export function WorkspaceMenu({ content, onAction }: { content: Extract<FlyoutContent, { kind: 'workspace-menu' }>; onAction(a: FlyoutAction): void }): React.JSX.Element {
  const emptyId = useId()
  const rows = workspaceMenuRows(content)
  // 행이 하나도 들어가지 않는 낮은 화면(모두 "외 N개")은 빈 목록이 아니다
  const empty = content.workspaces.length === 0 && content.more === 0
  const saved = rows.slice(0, content.workspaces.length)
  const commands = rows.slice(content.workspaces.length)
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
        saved.map((row) => <MenuRowButton key={row.key} row={row} icon={ICONS['workspace-run']} onAction={onAction} />)
      )}
      <MenuSeparator />
      {commands.map((row) => (
        <MenuRowButton key={row.key} row={row} icon={ICONS[row.action.type as 'workspace-save' | 'workspace-edit']} onAction={onAction} />
      ))}
    </MenuBody>
  )
}
