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
