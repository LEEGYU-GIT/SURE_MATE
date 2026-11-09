import type { FlyoutAction } from '../../../shared/flyout/flyout-content'
import type { MaskingMode } from '../../../shared/types'
import { MenuBody, MenuHeader, MenuRowButton } from './Menu'
import { maskingMenuRows, MENU_TITLES } from './menu-model'

/**
 * 바의 방패를 누르면 뜨는 가명 처리 기본값 메뉴(끔·가명 후 되돌리기·결과에서 빼기).
 * 행마다 고르면 생기는 일을 한 줄로 적고, 끔은 그 글과 주황(--warn)으로 함께 알린다(색만으로 알리지 않음).
 */
export function MaskingMenu({ mode, onAction }: { mode: MaskingMode; onAction(a: FlyoutAction): void }): React.JSX.Element {
  return (
    <MenuBody label={MENU_TITLES.masking}>
      <MenuHeader>{MENU_TITLES.masking}</MenuHeader>
      {maskingMenuRows(mode).map((row) => (
        <MenuRowButton key={row.key} row={row} onAction={onAction} />
      ))}
    </MenuBody>
  )
}
