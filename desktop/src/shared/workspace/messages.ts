import type { RestoreReport, WindowOutcome } from './restore-result'
import type { CaptureSkipped } from './capture'
import { WORKSPACE_LIMITS } from './types'

const MAX_NAMES = 2

/** 앱 이름은 두 개까지 `·`로 잇고 나머지는 ` 외 N개` */
function names(apps: string[]): string {
  const head = apps.slice(0, MAX_NAMES).join('·')
  return apps.length > MAX_NAMES ? `${head} 외 ${apps.length - MAX_NAMES}개` : head
}

/**
 * 옮겨지지 않은 창(blocked)의 까닭: 관리자 권한인지 모를 때(null)만 관리자 권한 창(UIPI)으로 본다. 관리자 권한이 아니라고 알거나,
 * 관리자 권한 창을 옮기려 했으면(나도 관리자 권한) 다른 까닭이라 '옮기지 못함'으로 알린다(A-M3)
 */
const unmovedAdmin = (o: WindowOutcome): boolean => o.result === 'blocked' && o.elevated == null

/** 결과 구간 순서와 문구. 이름 뒤에는 조사를 붙이지 않는다(받침을 알 수 없는 앱 이름) */
const GROUPS: { has: (o: WindowOutcome) => boolean; text: (apps: string) => string }[] = [
  { has: (o) => o.result === 'missing' || o.result === 'gone', text: (a) => `${a} 못 찾음` },
  { has: (o) => o.result === 'elevated' || unmovedAdmin(o), text: (a) => `관리자 권한 창이라 건너뜀: ${a}` },
  { has: (o) => o.result === 'hung', text: (a) => `${a} 응답 없음` },
  { has: (o) => o.result === 'off', text: (a) => `${a} 위치가 조금 다름` },
  { has: (o) => o.result === 'failed' || o.result === 'timeout' || (o.result === 'blocked' && !unmovedAdmin(o)), text: (a) => `${a} 옮기지 못함` }
]

export function restoreSummary(name: string, r: RestoreReport): string {
  const head = r.placed >= r.total ? `${name} · 창 ${r.total}개 모두 배치했어요` : `${name} · 창 ${r.total}개 중 ${r.placed}개 배치`
  const parts = [head]
  for (const g of GROUPS) {
    const apps = r.outcomes.filter(g.has).map((o) => o.app)
    if (apps.length > 0) parts.push(g.text(names(apps)))
  }
  const text = parts.join(' · ')
  return r.gathered ? `주 모니터로 모았어요 · ${text}` : text
}

/**
 * 저장 결과에 덧붙이는, 빼고 저장한 창 조각: 최소화한 창, 40개를 넘은 창(capture가 센 수, A-M9).
 * 작업 표시줄·화면 밖 창은 사용자가 놓은 창이 아니라 알리지 않는다. 설정 창의 다시 저장 결과도 같은 조각을 쓴다
 */
export function skippedParts(skipped: CaptureSkipped): string[] {
  const parts: string[] = []
  if (skipped.minimized > 0) parts.push(`최소화된 창 ${skipped.minimized}개는 빼고 저장`)
  if (skipped.overLimit > 0) parts.push(`${WORKSPACE_LIMITS.windows}개를 넘는 창 ${skipped.overLimit}개는 빼고 저장`)
  return parts
}

/**
 * 저장 알림. renameHint: 이름을 붙이지 않고 저장했을 때(바·지금 배치 저장의 '배치 N') 이름·단축키를 바꾸는 곳(설정 창의
 * 워크스페이스 탭)을 덧붙인다. 팔레트 `@이름` 줄은 이름을 친 것이라 붙이지 않는다
 */
export function saveSummary(o: { name: string; windows: number; skipped: CaptureSkipped; renameHint?: boolean }): string {
  const parts = [`${o.name} · 창 ${o.windows}개 배치를 저장했어요`, ...skippedParts(o.skipped)]
  if (o.renameHint) parts.push('이름·단축키는 설정에서 바꿀 수 있어요')
  return parts.join(' · ')
}

/**
 * 알림·설정 창에 보이는 안내. 무엇이 문제인지와 어떻게 할지를 함께 말한다(해요체).
 * nativeUnavailable·gatherQuestion은 계획·설계에 적힌 그대로다. busy는 저장·불러오기 어느 쪽이 진행 중이어도 맞는 말이다
 * (다른 모니터 구성 질문 창이 떠 있는 동안도 진행 중이다).
 */
export const WORKSPACE_NOTES = {
  nativeUnavailable: '보안 프로그램이 Win32 기능을 막아 창을 옮기거나 저장할 수 없어요.',
  busy: '창 배치를 저장하거나 불러오는 중이에요. 끝난 뒤 다시 해 주세요.',
  noWindows: '저장할 창이 없어요. 최소화한 창은 저장하지 않아요.',
  limit: `워크스페이스는 ${WORKSPACE_LIMITS.workspaces}개까지 저장해요. 설정에서 쓰지 않는 것을 지운 뒤 다시 해 주세요.`,
  missing: '워크스페이스를 찾지 못했어요. 이미 지웠을 수 있어요.',
  empty: '불러올 창이 없어요. 설정에서 창을 하나 이상 포함해 주세요.',
  saveFailed: '워크스페이스 파일을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.',
  gatherQuestion: '다른 모니터 구성에서 저장한 배치예요. 주 모니터로 모을까요?',
  gatherDetail: (saved: number, current: number): string => `저장할 때 모니터 ${saved}대 · 지금 ${current}대`,
  gatherYes: '주 모니터로 모으기',
  cancel: '취소'
} as const
