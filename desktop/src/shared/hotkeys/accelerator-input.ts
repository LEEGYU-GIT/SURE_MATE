// 단축키 조합 글: 설정 창 녹화 칸이 누른 키를 조합 글로 바꾸고(acceleratorFromKey), main의 단축키 바꾸기가 겹침을 견준다(sameAccelerator)

/** 키 녹화 칸이 받은 키(KeyboardEvent에서 쓰는 값만) */
export interface KeyInput {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  isComposing: boolean
}

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'])

/** 보조키(좌우 Ctrl·Alt·Shift·Win)의 e.code인지. 녹화 칸이 누름의 시작·끝을 가린다(record-watch.ts) */
export const isModifierCode = (code: string): boolean => MODIFIER_CODES.has(code)

/** e.code → Electron 조합의 주 키 이름(한/영 상태와 상관없이 같은 자리) */
const NAMED: Record<string, string> = {
  Space: 'Space',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Enter: 'Enter',
  Tab: 'Tab',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

/** 글자(KeyA~Z)·숫자(Digit0~9)·F키 밖에 녹화할 수 있는 키(e.code). main이 모두 주 키 코드를 아는지 시험한다 */
export const NAMED_KEY_CODES: readonly string[] = Object.keys(NAMED)

/** 녹화할 수 없는 키(숫자 키패드·미디어 키 등)를 눌렀을 때. main도 주 키를 모르는 조합을 같은 문구로 거절한다 */
export const UNKNOWN_KEY = '이 키는 단축키로 쓸 수 없어요. 글자·숫자·F키·Space 등을 눌러 주세요'

function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit) return digit[1]
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  return NAMED[code] ?? null
}

/**
 * 키 녹화(설계 문서 §6): 보조키 + 주 키를 Electron 조합 글로 바꾼다. 키는 e.code로 본다(한글 모드에서 e.key는 'Process').
 * 보조키만 눌렀거나 한글 조합 중이면 pending, 보조키 없는 Esc는 cancel, Win 키 조합·보조키 없는 키·모르는 키는 invalid.
 * 막힌 조합(F12 등)·경고 조합은 main이 다시 검사한다.
 */
export function acceleratorFromKey(k: KeyInput): { acc: string } | { pending: true } | { cancel: true } | { invalid: string } {
  if (k.isComposing || MODIFIER_CODES.has(k.code)) return { pending: true }
  if (k.code === 'Escape' && !k.ctrlKey && !k.altKey && !k.shiftKey && !k.metaKey) return { cancel: true }
  if (k.metaKey) return { invalid: 'Windows 키 조합은 OS가 쓰고 있어 쓸 수 없어요' }
  if (!k.ctrlKey && !k.altKey) return { invalid: 'Ctrl이나 Alt와 함께 눌러 주세요' }
  const key = keyName(k.code)
  if (!key) return { invalid: UNKNOWN_KEY }
  return { acc: [k.ctrlKey && 'Ctrl', k.altKey && 'Alt', k.shiftKey && 'Shift', key].filter(Boolean).join('+') }
}

/** Electron 조합 글에서 같은 뜻인 이름(보조키·주 키) */
const SAME_NAME = new Map([
  ['control', 'ctrl'],
  ['cmdorctrl', 'ctrl'],
  ['commandorcontrol', 'ctrl'],
  ['option', 'alt'],
  ['meta', 'super'],
  ['cmd', 'super'],
  ['command', 'super'],
  ['return', 'enter'],
  ['esc', 'escape'],
  ['del', 'delete'],
  ['ins', 'insert']
])

/** 비교용 조합 글: 소문자·같은 뜻 이름은 하나로, 보조키는 정렬하고 주 키(마지막)는 끝에 */
function comparable(acc: string): string {
  const tokens = acc
    .split('+')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => SAME_NAME.get(t) ?? t)
  const key = tokens.pop() ?? ''
  return [...new Set(tokens)].sort().concat(key).join('+')
}

/** 두 단축키가 같은 조합인지. 보조키 순서·대소문자·같은 뜻 이름(Control·Ctrl)은 따지지 않는다(겹침 검사) */
export function sameAccelerator(a: string, b: string): boolean {
  return comparable(a) === comparable(b)
}
