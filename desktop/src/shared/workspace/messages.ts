import type { RestoreReport, OutcomeResult } from './restore-result'
import type { CaptureSkipped } from './capture'

const MAX_NAMES = 2

/** 앱 이름은 두 개까지 `·`로 잇고 나머지는 ` 외 N개` */
function names(apps: string[]): string {
  const head = apps.slice(0, MAX_NAMES).join('·')
  return apps.length > MAX_NAMES ? `${head} 외 ${apps.length - MAX_NAMES}개` : head
}

/** 결과 구간 순서와 문구. 이름 뒤에는 조사를 붙이지 않는다(받침을 알 수 없는 앱 이름) */
const GROUPS: { results: OutcomeResult[]; text: (apps: string) => string }[] = [
  { results: ['missing', 'gone'], text: (a) => `${a} 못 찾음` },
  { results: ['elevated', 'blocked'], text: (a) => `관리자 권한 창이라 건너뜀: ${a}` },
  { results: ['hung'], text: (a) => `${a} 응답 없음` },
  { results: ['off'], text: (a) => `${a} 위치가 조금 다름` },
  { results: ['failed', 'timeout'], text: (a) => `${a} 옮기지 못함` }
]

export function restoreSummary(name: string, r: RestoreReport): string {
  const head = r.placed >= r.total ? `${name} · 창 ${r.total}개 모두 배치했어요` : `${name} · 창 ${r.total}개 중 ${r.placed}개 배치`
  const parts = [head]
  for (const g of GROUPS) {
    const apps = r.outcomes.filter((o) => g.results.includes(o.result)).map((o) => o.app)
    if (apps.length > 0) parts.push(g.text(names(apps)))
  }
  const text = parts.join(' · ')
  return r.gathered ? `주 모니터로 모았어요 · ${text}` : text
}

export function saveSummary(o: { name: string; windows: number; skipped: CaptureSkipped }): string {
  const base = `${o.name} · 창 ${o.windows}개 배치를 저장했어요`
  return o.skipped.minimized > 0 ? `${base} · 최소화된 창 ${o.skipped.minimized}개는 빼고 저장` : base
}

export const WORKSPACE_NOTES = {
  nativeUnavailable: '보안 프로그램이 Win32 기능을 막아 창을 옮기거나 저장할 수 없어요.',
  busy: '창 배치를 옮기는 중이에요. 끝난 뒤 다시 해 주세요.',
  noWindows: '저장할 창이 없어요.',
  limit: '워크스페이스는 30개까지 저장해요. 쓰지 않는 것을 지운 뒤 다시 해 주세요.',
  missing: '저장한 배치를 찾지 못했어요.',
  empty: '불러올 창이 없어요. 편집 화면에서 창을 포함해 주세요.',
  saveFailed: '배치 파일을 저장하지 못했어요.',
  gatherQuestion: '다른 모니터 구성에서 저장한 배치예요. 주 모니터로 모을까요?',
  gatherDetail: (saved: number, current: number): string => `저장할 때 모니터 ${saved}대 · 지금 ${current}대`,
  gatherYes: '주 모니터로 모으기',
  cancel: '취소'
} as const
