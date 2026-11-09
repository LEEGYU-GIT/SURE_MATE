/** 읽지 못한 템플릿·가명 사전·용어 파일을 트레이로 알릴 한 건 */
export interface FileErrorReport {
  /** '프롬프트 템플릿'·'가명 사전 항목'·'용어' */
  what: string
  /** 건너뛰거나 줄인 까닭(나온 순서) */
  errors: string[]
  /** errors 가운데 읽었지만 링크·태그 등 일부 값만 뺀 항목 수. 나머지는 읽지 못해 건너뛴 항목이나 파일이다 */
  trimmed?: number
}

/**
 * 트레이 알림 글. 읽지 못해 건너뛴 것과, 읽었지만 일부 값만 뺀 것을 따로 센다
 * (일부만 뺀 용어는 목록에 그대로 있으므로 건너뛰었다고 하면 틀린 말이다). 끝에 첫 까닭을 붙인다.
 */
export function fileErrorNotice(r: FileErrorReport): string {
  const trimmed = Math.min(r.trimmed ?? 0, r.errors.length)
  const skipped = r.errors.length - trimmed
  const kept = `${trimmed}건은 링크·태그 등 일부 값을 빼고 읽었어요`
  const head =
    skipped > 0 && trimmed > 0
      ? `${r.what} ${skipped}건을 읽지 못해 건너뛰었고, ${kept}`
      : trimmed > 0
        ? `${r.what} ${kept}`
        : `${r.what} ${skipped}건을 읽지 못해 건너뛰었어요`
  return `${head}. ${r.errors[0] ?? ''}`
}
