import type { BarShape } from '../bar/bar-settings'
import { MASKING_MODES } from '../masking/modes'
import type { MaskingMode } from '../types'
import type { FlyoutAction } from './flyout-content'

/** 용어 id 최대 길이(팔레트 위키 IPC와 같다) */
export const FLYOUT_ID_MAX = 200
/** 위키 카드에서 팔레트로 넘기는 검색어 최대 글자 수 */
export const WIKI_QUERY_MAX = 60
/** 펼침 창이 알려 오는 내용 크기의 상한(DIP) */
export const FLYOUT_SIZE_MAX = 4000

const BAR_SHAPES: readonly BarShape[] = ['edge', 'capsule', 'off']

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const idOf = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= FLYOUT_ID_MAX ? v : null)

/**
 * 펼침 창(renderer)이 보낸 동작을 검사한다. 틀리면 null.
 * 동작마다 필요한 값만 새 객체로 옮겨 담아 그 밖의 값은 main에 넘기지 않는다.
 */
export function parseFlyoutAction(raw: unknown): FlyoutAction | null {
  if (!isObj(raw)) return null
  switch (raw.type) {
    case 'set-masking':
      return MASKING_MODES.includes(raw.mode as MaskingMode) ? { type: 'set-masking', mode: raw.mode as MaskingMode } : null
    case 'set-bar-shape':
      return BAR_SHAPES.includes(raw.shape as BarShape) ? { type: 'set-bar-shape', shape: raw.shape as BarShape } : null
    case 'snooze-bar':
    case 'open-settings':
    case 'wiki-clipboard':
    case 'workspace-save':
    case 'workspace-edit':
    case 'close':
      return { type: raw.type }
    case 'wiki-copy':
    case 'wiki-open':
    case 'workspace-run': {
      const id = idOf(raw.id)
      return id === null ? null : { type: raw.type, id }
    }
    case 'wiki-pin':
      return typeof raw.pinned === 'boolean' ? { type: 'wiki-pin', pinned: raw.pinned } : null
    case 'wiki-search':
      if (typeof raw.query !== 'string') return null
      // 글자(코드 포인트) 단위로 잘라 이모지 반쪽이 남지 않게 한다
      return { type: 'wiki-search', query: Array.from(raw.query.trim()).slice(0, WIKI_QUERY_MAX).join('') }
    default:
      return null
  }
}

const sizeOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= FLYOUT_SIZE_MAX ? v : null)

/** 펼침 창이 그린 내용의 크기 알림(seq는 0 이상 정수, 크기는 1~4000 DIP). 틀리면 null */
export function parseFlyoutReady(seq: unknown, w: unknown, h: unknown): { seq: number; width: number; height: number } | null {
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return null
  const width = sizeOf(w)
  const height = sizeOf(h)
  return width === null || height === null ? null : { seq, width, height }
}
