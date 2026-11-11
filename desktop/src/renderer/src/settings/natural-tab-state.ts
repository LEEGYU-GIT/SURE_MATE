import type { IntentTargetView, NaturalView, PhraseRow } from '../../../shared/natural/natural-ipc'
import { PALETTE_GROUPS } from '../../../shared/palette-query'
import type { PaletteGroup } from '../../../shared/types'

/**
 * 설정 창 말하듯 입력 탭 문구(design:ux-copy, 해요체). 문장·항목 이름은 화면에만 보이고 로그에는 남지 않는다.
 * 단어 목록 파일 위치는 실제 경로(Windows 사용자 이름이 있다) 대신 %APPDATA% 꼴로 적는다.
 * 두 문장짜리 안내는 배열로 두고 뜻 단위로 줄을 바꾼다. 괄호 안 화면 이름은 줄이 바뀌어도 갈라지지 않게 줄바꿈 없는 공백(\u00a0)을 쓴다.
 */
export const NATURAL_COPY = {
  intro: '기억한 문장, 사용 기록, 단어 목록은 모두 이 PC에만 저장돼요.',
  loading: '말하듯 입력 내용을 읽는 중이에요…',
  loadFailed: '내용을 읽지 못했어요. 다시 해 주세요',
  retry: '다시 읽기',

  phrasesTitle: (n: number, max: number): string => `기억한 문장 (${n}개, 최대 ${max}개)`,
  phrasesHelp: ['같은 문장을 입력하면 그 항목이 맨 위에 와요.', '띄어쓰기와 끝 기호는 빼고 기억해요.'],
  phrasesList: '기억한 문장',
  /** 화면 읽기 프로그램만 읽는 말: 화살표 아이콘이 보이는 관계(이 문장 → 맨 위에 오는 항목) */
  targetSr: '맨 위에 오는 항목 ',
  missing: '지금은 없는 항목이에요',
  forget: '지우기',
  forgetLabel: (key: string): string => `‘${key}’ 지우기`,
  forgot: (key: string): string => `‘${key}’ 문장을 지웠어요`,
  forgetAll: '모두 지우기',
  /** 모두 지우기 단추 앞에 화면 읽기 프로그램만 읽는 말(보이는 글이 이름 안에 그대로 있게) */
  forgetAllContext: '기억한 문장 ',
  forgetAllArmed: '한 번 더 누르면 모두 지워요',
  forgotAll: (n: number): string => `기억한 문장 ${n}개를 지웠어요`,
  removeFailed: '지우지 못했어요. 다시 해 주세요',
  emptyTitle: '기억한 문장이 없어요',
  /** 빈 화면 안내 첫 줄: 앞말 [Shift] [Enter] 뒷말(팔레트의 '기억하고 실행' 안내와 같은 키 모양) */
  emptyHow: ['팔레트에서 맨 위가 아닌 후보를 고른 뒤', '(기억하고\u00a0실행)를 누르세요.'],
  emptyThen: '다음부터 같은 문장을 입력하면 그 항목이 맨 위에 와요.',

  usageTitle: '최근·자주 쓴 항목',
  usageLabel: (n: number): string => (n > 0 ? `사용 기록 ${n}개` : '사용 기록 없음'),
  usageHelp: ['팔레트 빈 화면의 ‘최근’ 목록과, 점수가 같은 후보의 순서에 써요.', '실행한 항목·횟수·시각만 남고, 입력한 문장은 남지 않아요.'],
  clearUsage: '사용 기록 지우기',
  clearUsageArmed: '한 번 더 누르면 지워요',
  clearedUsage: (n: number): string => `사용 기록 ${n}개를 지웠어요`,

  intentsTitle: '단어 목록',
  sourceUser: '내 파일을 쓰고 있어요',
  sourceBuiltin: '기본 목록을 쓰고 있어요',
  path: '%APPDATA%\\Sure-Mate\\intents.json',
  noFileYet: '아직 파일이 없어요. 열면 기본 목록을 복사해 만들어요.',
  applyWhen: ['고친 내용은 다음 팔레트 검색부터 써요.', '파일의 수정 시각이나 크기가 바뀌면 다시 읽어요.'],
  open: '단어 목록 파일 열기',
  opening: '여는 중…',
  openFailed: '파일을 열지 못했어요. 다시 해 주세요',
  fileBroken: '파일을 읽지 못했어요. 파일을 열어 고쳐 주세요.',
  filePartial: (n: number): string => `읽지 못한 부분 ${n}건은 빼고 쓰고 있어요.`,
  stripLabel: '문장에서 떼는 말',
  stripCounts: (endings: number, particles: number, fillers: number): string => `어미 ${endings}개 · 조사 ${particles}개 · 군말 ${fillers}개`,

  rulesTitle: (n: number): string => `의도 단어 (${n}개)`,
  rulesHelp: '문장에 이 단어가 있으면 그 항목을 위로 올리고, 맨 위 후보에 이름을 표시해요.',
  /** 화면 읽기 프로그램만 읽는 말: 화살표 아이콘이 보이는 관계(의도 규칙 → 올리는 항목) */
  ruleTargetSr: '올리는 항목 ',
  missingTarget: '지금 없는 항목',
  noWords: '단어 없음',
  wordsLabel: (label: string): string => `${label} 단어`
} as const

/** 새 보기를 받을지: 처음이거나 rev가 같거나 크면 새 보기, 작으면(지우기 전에 만든 바뀜 알림) 지금 보기를 둔다 */
export const newerView = (prev: NaturalView | null, next: NaturalView): NaturalView => (prev && prev.rev > next.rev ? prev : next)

/** 구역 이름(팔레트 구역 머리글과 같은 말) */
export const sectionLabel = (g: PaletteGroup): string => PALETTE_GROUPS.find((x) => x.id === g)?.label ?? g

/** 기억한 문장이 여는 항목: '이름 · 구역', 지금 없으면 그렇다고 */
export const phraseTarget = (row: PhraseRow): string => (row.item ? `${row.item.title} · ${sectionLabel(row.item.group)}` : NATURAL_COPY.missing)

/**
 * 줄을 지운 뒤 포커스를 둘 문장(키보드만으로 사용, §16): 지운 줄 자리에 온 다음 줄, 마지막 줄이었으면 그 앞 줄.
 * 그사이 다른 곳에서도 바뀌었으면 지우기 전 순서에서 가까운 남은 줄, 그것도 없으면 새 목록의 첫 줄. 남은 줄이 없으면 null(빈 화면으로)
 */
export function focusAfterRemove(before: readonly string[], removed: string, after: readonly string[]): string | null {
  if (after.length === 0) return null
  const remaining = new Set(after)
  const i = before.indexOf(removed)
  for (let j = i + 1; j < before.length; j++) if (remaining.has(before[j])) return before[j]
  for (let j = i - 1; j >= 0; j--) if (remaining.has(before[j])) return before[j]
  return after[0]
}

/** 의도 규칙 대상: 구역은 '… 구역', 항목은 이름. 여럿이면 처음 아는 것 '외 N개', 아는 것이 없으면 '지금 없는 항목' */
export function targetText(targets: readonly IntentTargetView[]): string {
  if (targets.length === 0) return ''
  const named = targets.map((t) => ('group' in t ? `${sectionLabel(t.group)} 구역` : t.title)).filter((x): x is string => x !== null)
  if (named.length === 0) return NATURAL_COPY.missingTarget
  return targets.length > 1 ? `${named[0]} 외 ${targets.length - 1}개` : named[0]
}

/** 단어 목록 파일 문제 알림(파일 내용 없이 순번·까닭만): 없으면 null. 자세히는 앞 세 건과 남은 건수 */
export function intentFileNotice(i: NaturalView['intents']): { text: string; details: string } | null {
  if (i.errors.length === 0) return null
  const more = i.errors.length > 3 ? ` 외 ${i.errors.length - 3}건` : ''
  return {
    text: i.source === 'user' ? NATURAL_COPY.filePartial(i.errors.length) : NATURAL_COPY.fileBroken,
    details: i.errors.slice(0, 3).join(' · ') + more
  }
}
