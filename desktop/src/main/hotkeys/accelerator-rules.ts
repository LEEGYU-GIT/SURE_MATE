export type AcceleratorCheck = { level: 'ok' | 'warn' | 'block'; reason?: string }

const WIN_KEYS = new Set(['super', 'meta', 'cmd', 'command'])
const CTRL = new Set(['ctrl', 'control', 'cmdorctrl', 'commandorcontrol'])
const ALT = new Set(['alt', 'option'])

/** 다른 도구(Windows 창 메뉴, PowerToys Run, ChatGPT 앱, IDE 자동완성)와 자주 겹치는 조합 */
const WARN = new Map<string, string>([
  ['alt+space', 'Windows 창 메뉴·PowerToys Run·ChatGPT 앱과 겹칠 수 있음'],
  ['ctrl+space', 'IDE 자동완성과 겹칠 수 있음'],
  ['ctrl+shift+space', 'IDE 자동완성과 겹칠 수 있음']
])

/**
 * 복사·붙여넣기·잘라내기·실행 취소·다시 실행·모두 선택·저장(Ctrl + 이 글자 하나). 전역 단축키로 잡으면 모든 앱에서 이 편집이 사라져
 * 새로 고를 때는 막는다. 이 규칙 전에 저장해 둔 조합은 시작할 때 그대로 등록한다(checkAccelerator의 saved)
 */
const EDIT_KEYS = new Set(['c', 'v', 'x', 'z', 'y', 'a', 's'])
const EDIT_REASON = '복사·붙여넣기 같은 기본 편집 단축키예요'

/** Ctrl + 글자·숫자 하나를 앱들이 흔히 쓰는 기능(가로챈다는 안내에 함께 적는다). 앱마다 달라 여기 없는 글자는 조합만 적는다 */
const CTRL_USES: Record<string, string> = {
  f: '찾기',
  g: '찾기·이동',
  h: '바꾸기',
  n: '새로 만들기',
  o: '열기',
  p: '인쇄',
  r: '새로 고침',
  t: '새 탭',
  w: '닫기',
  b: '굵게',
  i: '기울임',
  u: '밑줄',
  ...Object.fromEntries('123456789'.split('').map((d) => [d, '탭 이동']))
}

/** 다른 앱의 그 조합 기능을 가로챈다는 경고(조합은 Ctrl+G 꼴로) */
const steals = (combo: string, use?: string): string => `다른 앱의 ${combo} 기능${use ? `(${use} 등)` : ''}을 가로채요`

/** 글자·숫자·F키 밖의 주 키 → Windows 가상 키 코드 */
const NAMED_KEYS: Record<string, number> = {
  space: 0x20,
  tab: 0x09,
  enter: 0x0d,
  return: 0x0d,
  esc: 0x1b,
  escape: 0x1b,
  backspace: 0x08,
  delete: 0x2e,
  del: 0x2e,
  insert: 0x2d,
  ins: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  '`': 0xc0,
  '-': 0xbd,
  '=': 0xbb,
  plus: 0xbb,
  '[': 0xdb,
  ']': 0xdd,
  '\\': 0xdc,
  ';': 0xba,
  "'": 0xde,
  ',': 0xbc,
  '.': 0xbe,
  '/': 0xbf
}

/** 단축키의 주 키(마지막 키)를 Windows 가상 키 코드로 바꾼다. 모르는 키면 null */
export function acceleratorKeyCode(accelerator: string): number | null {
  const key = (accelerator.split('+').pop() ?? '').trim().toLowerCase()
  if (/^[a-z0-9]$/.test(key)) return key.toUpperCase().charCodeAt(0)
  const f = /^f([1-9]|1\d|2[0-4])$/.exec(key)
  if (f) return 0x6f + Number(f[1])
  return NAMED_KEYS[key] ?? null
}

/**
 * 전역 단축키로 써도 되는 조합인지 판단한다. 새로 고를 때(설정 창 녹화·온보딩, hotkey-change.ts의 check)는 그대로 쓴다.
 * saved는 이미 저장해 둔 조합을 등록할 때(HotkeyManager.bind: 시작, 바꾸기 실패 뒤 되돌리기): 새로 고를 때만 막는 조합(기본 편집
 * 단축키)을 경고로 낮춰 이 규칙 전에 저장한 단축키가 말없이 사라지지 않게 한다. 원래 막던 조합(Win 키·F12 등)은 그대로 막는다
 */
export function checkAccelerator(accelerator: string, o: { saved?: boolean } = {}): AcceleratorCheck {
  const tokens = accelerator
    .split('+')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.some((t) => WIN_KEYS.has(t))) return { level: 'block', reason: 'Windows 키 조합은 OS가 예약함' }
  if (tokens.includes('altgr')) return { level: 'block', reason: '오른쪽 Alt는 한/영 전환 키' }
  if (tokens.includes('f12')) return { level: 'block', reason: 'F12는 디버거용으로 예약됨' }

  const hasCtrl = tokens.some((t) => CTRL.has(t))
  const hasAlt = tokens.some((t) => ALT.has(t))
  if (!hasCtrl && !hasAlt) return { level: 'block', reason: 'Ctrl 또는 Alt가 들어가야 함' }

  const key = tokens[tokens.length - 1]
  const hasShift = tokens.includes('shift')
  // Ctrl만 + 글자·숫자 하나: 앱 안 단축키 자리(편집 단축키는 막고, 나머지는 가로챈다고 경고)
  if (hasCtrl && !hasAlt && !hasShift && /^[a-z0-9]$/.test(key)) {
    if (EDIT_KEYS.has(key)) return { level: o.saved ? 'warn' : 'block', reason: EDIT_REASON }
    return { level: 'warn', reason: steals(`Ctrl+${key.toUpperCase()}`, CTRL_USES[key]) }
  }
  // Alt만 + 글자 하나: 메뉴를 여는 키(파일(F) 등)
  if (hasAlt && !hasCtrl && !hasShift && /^[a-z]$/.test(key)) return { level: 'warn', reason: steals(`Alt+${key.toUpperCase()}`, '메뉴 열기') }

  const canonical = [hasCtrl && 'ctrl', hasAlt && 'alt', hasShift && 'shift', key].filter(Boolean).join('+')
  const warn = WARN.get(canonical)
  return warn ? { level: 'warn', reason: warn } : { level: 'ok' }
}
