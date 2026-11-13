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

/**
 * 선택 효과가 setSelected에 넘길 갱신 함수. 지난 검색어는 만들 때의 값으로 붙잡는다: React는 갱신 함수를 다음 렌더에서 부를 수 있어
 * 그때 ref를 읽으면 이미 새 검색어로 바뀌어 있다. 그러면 검색어가 바뀌었는데도 지난 선택(지난 검색어의 맨 위)이 남아 Enter가 다른 항목을
 * 실행했다(2026-11-13 스모크 t23: 'Ttree 기록으로 주간보고 써' 때 맨 위였던 Ttree 열기가 '써줘'까지 친 뒤에도 골라져 있었다)
 */
export function selectionUpdater(o: { prevQuery: string; query: string; items: { id: string }[] }): (prev: string) => string {
  const { prevQuery, query, items } = o
  return (prev) => nextSelection({ selected: prev, prevQuery, query, items })
}
