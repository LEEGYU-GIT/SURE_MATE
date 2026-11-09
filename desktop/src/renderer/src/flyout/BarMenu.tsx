import type { BarShape } from '../../../shared/bar/bar-settings'
import type { FlyoutAction } from '../../../shared/flyout/flyout-content'
import { EyeOffIcon, SettingsIcon } from '../design/icons'
import { MenuBody, MenuHeader, MenuRowButton, MenuSeparator } from './Menu'
import { barMenuRows, isChoiceRow, MENU_TITLES } from './menu-model'

/** 명령 행 아이콘(설정은 바의 설정 단추와 같은 아이콘) */
const COMMAND_ICONS: Partial<Record<FlyoutAction['type'], React.JSX.Element>> = {
  'snooze-bar': <EyeOffIcon size={16} />,
  'open-settings': <SettingsIcon size={16} />
}

/** 바를 오른쪽 클릭하면 뜨는 메뉴: 바 모양(라디오) | 30분 동안 숨기기, 설정 열기 */
export function BarMenu({ shape, onAction }: { shape: BarShape; onAction(a: FlyoutAction): void }): React.JSX.Element {
  const rows = barMenuRows(shape)
  const shapes = rows.filter(isChoiceRow)
  const commands = rows.filter((r) => !isChoiceRow(r))
  return (
    <MenuBody label="Sure-Mate 바">
      <MenuHeader>{MENU_TITLES.barShape}</MenuHeader>
      <div role="group" aria-label={MENU_TITLES.barShape} className="flex flex-col">
        {shapes.map((row) => (
          <MenuRowButton key={row.key} row={row} onAction={onAction} />
        ))}
      </div>
      <MenuSeparator />
      {commands.map((row) => (
        <MenuRowButton key={row.key} row={row} icon={COMMAND_ICONS[row.action.type]} onAction={onAction} />
      ))}
    </MenuBody>
  )
}
