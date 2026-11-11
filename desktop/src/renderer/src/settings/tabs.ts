/** 설정 창 탭(설계 문서 §14 순서, 지금 있는 기능). 펫·워크스페이스·말하듯 입력은 M6·M7이 한 줄씩 더한다 */
export const SETTINGS_TABS = [
  { id: 'general', label: '일반' },
  { id: 'hotkeys', label: '단축키' },
  { id: 'ai', label: 'AI 대상' },
  { id: 'prompts', label: '프롬프트·상용구' },
  { id: 'masking', label: '가명 처리' },
  { id: 'glossary', label: '용어 사전' },
  { id: 'bar', label: '바' }
] as const

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id']

/** 탭 목록 키보드(↑↓·Home·End). 끝에서 멈추고, 한글 조합 중이거나 다른 키면 null */
export function navKey(index: number, k: { code: string; isComposing: boolean }, count: number): number | null {
  if (k.isComposing) return null
  switch (k.code) {
    case 'ArrowDown':
      return Math.min(count - 1, index + 1)
    case 'ArrowUp':
      return Math.max(0, index - 1)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
