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

/** 전역 단축키로 써도 되는 조합인지 판단한다. */
export function checkAccelerator(accelerator: string): AcceleratorCheck {
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
  const canonical = [hasCtrl && 'ctrl', hasAlt && 'alt', tokens.includes('shift') && 'shift', key].filter(Boolean).join('+')
  const warn = WARN.get(canonical)
  return warn ? { level: 'warn', reason: warn } : { level: 'ok' }
}
