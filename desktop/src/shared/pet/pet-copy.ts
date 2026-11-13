import type { AppEvent } from '../app-events'
import { CAPTURE_NOTES } from '../labels'
import { ALL_CATEGORIES, type MaskCategory } from '../masking/types'
import type { PetMenuRow } from './pet-view'

/**
 * 말풍선에 쓰는 분류 이름(바꾼 글이 무엇인지). 이름 분류는 "~명", 패턴 분류는 그 글의 종류.
 * 확인 화면 이름(MASK_CATEGORY_LABELS: 담당자, 사내 URL)과 같은 말을 쓴다. 고객사는 설계 예시대로 "고객사명".
 */
export const PET_CATEGORY_NOUNS: Record<MaskCategory, string> = {
  client: '고객사명',
  project: '프로젝트명',
  person: '담당자명',
  system: '시스템명',
  ip: 'IP',
  path: '경로',
  email: '이메일',
  phone: '전화번호',
  url: '사내 URL'
}

/** 말풍선에 넣는 AI 이름 최대 글자 수. 넘으면 줄임표로 잘라 끝 문장(어디에 붙여넣을지)이 4줄 안에 남게 한다 */
export const AI_NAME_MAX = 16

/** 설계 문서 §14-2 원문(바꾸려면 사용자 확인) */
const WARN = '가명 처리가 꺼져 있어요. 이름이 그대로 들어갔어요.'
const RESTORED = '원래 이름으로 되돌렸어요.'
const COPIED = '복사했어요.'
/** 끝 문장 "{AI} 창에 붙여넣어 주세요."의 뒷부분(말풍선은 AI 이름과 "창에"를 한 줄에 둔다) */
export const PASTE_INTO = '창에 붙여넣어 주세요.'
/** 복사만(열 AI 없음): "{AI} 창에 붙여넣어 주세요."와 같은 모양 */
const PASTE_ANYWHERE = '원하는 곳에 붙여넣어 주세요.'
/** 목록에 보이는 분류 수. 나머지는 " 외 {건수 합}건" */
const LISTED = 2

const count = (n: number): string => `${n.toLocaleString('ko-KR')}건`

/** 분류별 건수를 합쳐(0건 제외) 많은 순(같으면 분류 순서)으로 두 개까지 "고객사명 1건·IP 2건", 나머지는 " 외 N건" */
function maskedList(masked: { category: MaskCategory; count: number }[]): string | null {
  const totals = new Map<MaskCategory, number>()
  for (const m of masked) {
    if (!(m.count > 0) || !Number.isFinite(m.count)) continue
    totals.set(m.category, (totals.get(m.category) ?? 0) + Math.round(m.count))
  }
  const order = (c: MaskCategory): number => ALL_CATEGORIES.indexOf(c)
  const sorted = [...totals].sort(([a, x], [b, y]) => y - x || order(a) - order(b))
  if (sorted.length === 0) return null
  const head = sorted
    .slice(0, LISTED)
    .map(([c, n]) => `${PET_CATEGORY_NOUNS[c]} ${count(n)}`)
    .join('·')
  const rest = sorted.slice(LISTED).reduce((sum, [, n]) => sum + n, 0)
  return rest > 0 ? `${head} 외 ${count(rest)}` : head
}

/** 공백을 하나로 줄이고 너무 길면 자른다. 비면 null(복사만과 같다) */
function aiName(target: string | null): string | null {
  const name = (target ?? '').replace(/\s+/g, ' ').trim()
  if (!name) return null
  const chars = [...name]
  return chars.length > AI_NAME_MAX ? `${chars.slice(0, AI_NAME_MAX - 1).join('')}…` : name
}

/**
 * 앱 일 → 말풍선 문구(존댓말, 짧게, 설계 §14-2·§20). 건수·분류·AI 이름은 실제 값이다.
 * 보여 줄 것이 없으면(되돌린 것 없음) null. 문구는 화면에만 쓰고 로그에는 남기지 않는다.
 */
export function petBubbleText(e: AppEvent): string | null {
  switch (e.type) {
    case 'prompt-copied': {
      if (e.masking === 'off') return WARN
      const list = maskedList(e.masked)
      const name = aiName(e.target)
      const paste = name ? `${name} ${PASTE_INTO}` : PASTE_ANYWHERE
      // 목록은 늘 "N건"으로 끝나므로 조사는 "은"
      return [COPIED, list ? `${list}은 가명으로 바꿨어요.` : null, paste]
        .filter((s) => s !== null)
        .join(' ')
    }
    case 'unmasked':
      return e.restored > 0 ? RESTORED : null
    case 'capture-failed':
      return `${CAPTURE_NOTES[e.reason]}.`
  }
}

/**
 * 조종 키와 하는 일(설계 §14-2 "←→ 걷기, Space 뛰기, 바 옆에서 ↑ 오르기·↓ 내려오기, Esc 끝").
 * 메뉴 설명·조종 시작 말풍선·팔레트 부제가 같은 말을 쓴다. 키 이름은 키보드에 적힌 그대로.
 */
export const PET_CONTROL_KEY_ITEMS: readonly (readonly [key: string, action: string])[] = [
  ['←→', '걷기'],
  ['Space', '뛰기'],
  ['↑↓', '바 오르내리기'],
  ['Esc', '끝']
]

/** 한 줄 키 안내: "←→ 걷기 · Space 뛰기 · ↑↓ 바 오르내리기 · Esc 끝" */
export const PET_CONTROL_KEYS = PET_CONTROL_KEY_ITEMS.map(([k, v]) => `${k} ${v}`).join(' · ')

/** 조종을 시작할 때 말풍선: 할 일 한 문장(말풍선이 굵게 쓴다) + 키 안내. 메뉴 행은 한 줄이라 안내를 여기서 보인다 */
export const PET_CONTROL_GUIDE = `키보드로 조종해 보세요. ${PET_CONTROL_KEYS}`

/** 숨긴 펫을 다시 부르는 곳(메뉴 "숨기기"의 설명, 팔레트 숨김 알림과 같은 말) */
export const PET_RECALL_HINT = '바의 펫 단추나 트레이에서 다시 불러요'

/** 펫 창 화면(렌더러)이 다시 불러온 뒤에도 또 멈췄을 때 알림(한 번). 펫은 앱을 다시 켤 때까지 숨긴다 */
export const PET_CRASH_NOTICE = '말랑 메이트 화면에 문제가 생겨 숨겼어요. 앱을 다시 켜면 다시 나와요.'

/**
 * 쉬어 가기 말(2026-11-13 사용자 의견). 해요체 한 문장이고 말풍선 한 줄(글 너비 176, 13px)에 든다.
 * 고르기는 pet-nudge(바로 앞 줄은 다시 고르지 않는다). 문구는 화면에만 쓰고 로그에는 번호만 남긴다.
 * 설계 §20 "펫 말풍선 문구 검토" 대상이다(바꾸면 pet-copy.test.ts의 목록도 바꾼다)
 */
export const PET_NUDGE_LINES: readonly string[] = [
  '물도 마시고 해요!',
  '기지개 한번 켜 볼까요?',
  '눈 쉬게 먼 곳을 20초만 봐요.',
  '어깨 한번 돌려 볼까요?',
  '잠깐 일어나 걸어 볼까요?',
  '허리 쭉 펴고 해요!'
]

/**
 * Ttree 이석 미리 알림(2026-11-13) 말풍선과 Windows 알림(펫이 보일 수 없을 때). 자리에 있는 사람이 직접 움직이도록 알릴 뿐
 * Sure-Mate가 입력을 흉내 내지 않는다. 말풍선 3줄(글 너비 176, 13px) 안에 든다. 문구는 화면에만 쓰고 로그에는 남기지 않는다
 */
export function petAwayLine(leadMin: number): string {
  return `${leadMin}분 뒤 이석으로 잡혀요. 자리에 계시면 마우스를 한 번 움직여 주세요.`
}

/**
 * 이석 기준 직전 초 세기(2026-11-13 사용자 요청: 이석 창이 뜰까 걱정하는 사람이 많다). 기준 30초 전부터 1초마다 말풍선 문구만 바꾼다.
 * 두 번째 문장은 petAwayLine과 같다(말풍선 높이가 그대로라 글자만 바뀐다)
 */
export function petAwayCountdownLine(seconds: number): string {
  return `${seconds}초 뒤 이석으로 잡혀요. 자리에 계시면 마우스를 한 번 움직여 주세요.`
}

/** 숨긴 펫에 조종 단축키를 눌렀을 때 알림(누를 때마다 한 번). 부르는 곳은 PET_RECALL_HINT와 같은 순서(바의 펫 단추 → 트레이) */
export const PET_HIDDEN_NOTICE = '말랑 메이트가 숨어 있어요. 바의 펫 단추나 트레이에서 불러 주세요.'

/**
 * 오른쪽 클릭 메뉴 4행(설계 §14-2 "조종하기, 재우기, 숨기기, 펫 설정"). 졸고 있으면 두 번째 행이 깨우기다.
 * 행은 한 줄(높이 32)이라 설명은 화면 읽기 프로그램에만 준다. 부를 때마다 새 배열.
 */
export function petMenuRows(o: { sleeping: boolean }): PetMenuRow[] {
  return [
    { action: 'control', title: '조종하기', detail: PET_CONTROL_KEYS },
    o.sleeping ? { action: 'wake', title: '깨우기' } : { action: 'sleep', title: '재우기' },
    { action: 'hide', title: '숨기기', detail: PET_RECALL_HINT },
    { action: 'settings', title: '펫 설정' }
  ]
}
