/**
 * 목록에서 선택할 항목 id.
 * 검색어가 바뀌면 맨 위, 같으면 지금 선택을 유지하되 목록에서 사라졌으면 맨 위.
 * cmdk의 자동 선택은 지연 렌더링된 목록과 어긋날 수 있어 직접 정한다.
 */
export function nextSelection(s: { selected: string; prevQuery: string; query: string; items: { id: string }[] }): string {
  const first = s.items[0]?.id ?? ''
  if (s.query !== s.prevQuery) return first
  return s.items.some((item) => item.id === s.selected) ? s.selected : first
}
