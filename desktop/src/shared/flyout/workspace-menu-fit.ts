/**
 * 바 워크스페이스 메뉴의 높이(DIP). 펼침 창 화면(renderer/src/flyout/Menu.tsx·WorkspaceMenu.tsx)이 그리는 크기와 같다:
 * 안쪽 여백 위아래 4, 머리 28, 저장한 배치 행 52(제목 한 줄 + 설명 한 줄, 긴 이름은 말줄임), 구분선 8,
 * "지금 배치 저장" 32(저장할 수 없으면 두 줄 설명이 붙어 68), "모두 보기·편집" 52(설명 한 줄).
 * 행 높이를 바꾸면 이 값과 스모크 시험 t21(첫 행을 카드 위에서 58 DIP = 여백 4 + 머리 28 + 행 절반 26에서 누른다)을 함께 고친다
 */
export const WORKSPACE_MENU_METRICS = { padding: 8, header: 28, row: 52, separator: 8, save: 32, saveBlocked: 68, edit: 52 } as const

/** 저장한 배치 rows개를 보인 메뉴의 높이(목록이 비었을 때의 안내 글은 따로 그린다) */
export function workspaceMenuHeight(o: { rows: number; canSave: boolean }): number {
  const M = WORKSPACE_MENU_METRICS
  return M.padding + M.header + o.rows * M.row + M.separator + (o.canSave ? M.save : M.saveBlocked) + M.edit
}

/**
 * 메뉴가 maxHeight(카드가 쓸 수 있는 높이) 안에 들어가게 보일 저장한 배치 행 수(0~max). 메뉴는 스크롤하지 않으므로 넘치면
 * 아래의 "지금 배치 저장"·"모두 보기·편집"이 잘린다. 보이지 않는 배치는 "모두 보기·편집"의 "외 N개 더 있어요"로 알린다
 */
export function workspaceMenuRowsThatFit(o: { maxHeight: number; canSave: boolean; max: number }): number {
  const free = o.maxHeight - workspaceMenuHeight({ rows: 0, canSave: o.canSave })
  return Math.max(0, Math.min(o.max, Math.floor(free / WORKSPACE_MENU_METRICS.row)))
}
