/** 한글 IME 조합 중인 키 입력인지. 조합 끝 직후 keydown은 isComposing이 false여도 keyCode가 229다. */
export function isImeComposing(e: { isComposing?: boolean; keyCode?: number }): boolean {
  return e.isComposing === true || e.keyCode === 229
}
