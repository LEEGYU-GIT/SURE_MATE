import type { NaturalChangeResult, NaturalOpenResult, NaturalView, SearchContextPayload } from '../../shared/natural/natural-ipc'
import { buildNaturalView, type IntentState } from '../../shared/natural/natural-view'
import type { PaletteItem } from '../../shared/types'
import { createPickHandler } from './natural-commands'
import { PHRASE_MAX, type PhraseStore } from './phrase-store'
import type { UsageStore } from './usage-store'

export interface NaturalServiceDeps {
  phrases: PhraseStore
  usage: UsageStore
  /** 지금 쓰는 단어 목록과 출처(intent-store의 state) */
  intents(): Promise<IntentState>
  /** 지금 팔레트 항목(기억한 문장과 의도 규칙 대상의 이름·구역을 찾는다) */
  items(): Promise<PaletteItem[]>
  /** 단어 목록 파일 열기(팔레트 명령 cmd.open-intents와 같은 흐름, openIntentsFile). 열었으면 true */
  openIntents(): Promise<boolean>
  notify(message: string): void
  /** 건수·길이·참거짓만 넘긴다(문장은 넘기지 않는다) */
  log(event: string, data: Record<string, unknown>): void
  /** 사용 점수를 계산할 지금 시각(ms) */
  now(): number
}

export interface NaturalService {
  /** 팔레트 검색 문맥. 팔레트는 보일 때마다 새로 받으므로 지운 문장·사용 기록은 다음 검색부터 쓰지 않는다 */
  searchContext(): Promise<SearchContextPayload>
  /** palette:pick 처리(사용 기록, Shift+Enter 기억하기). 값 검사는 pick 처리기가 하고, 던지지 않는다 */
  pick(raw: unknown): Promise<void>
  /** 설정 창 말하듯 입력 탭 보기 */
  view(): Promise<NaturalView>
  /** 기억한 문장 하나 지우기(없으면 0건) */
  forget(key: string): Promise<NaturalChangeResult>
  /** 기억한 문장 모두 지우기 */
  forgetAll(): Promise<NaturalChangeResult>
  /** 사용 기록 지우기(기억한 문장은 그대로) */
  clearUsage(): Promise<NaturalChangeResult>
  openIntents(): Promise<NaturalOpenResult>
  /** 기억한 문장·사용 기록이 바뀌면(팔레트 선택, 설정 창 지우기). 돌려받은 함수로 그만 듣는다 */
  onChange(cb: () => void): () => void
}

/**
 * 말하듯 입력 데이터(설계 §13 8단계·§9 동점 순서·§14): 팔레트 검색 문맥과 설정 창 탭이 같은 저장소(phrase-map.json·usage.json)를
 * 읽고 쓴다. 저장소는 읽기·쓰기를 부른 순서대로 처리하고 바꾼 값을 메모리에 바로 두므로, 지운 내용은 다음 검색 문맥부터 빠진다(따로
 * 지울 캐시가 없다).
 * rev: 바꾸는 일은 저장소 줄에 넣기 직전에 rev를 올리고, 보기는 rev를 먼저 읽고 저장소 읽기를 바로 줄에 넣는다. 그래서 rev가 큰
 * 보기가 늘 더 새 내용이고, 화면은 작은 rev의 보기를 버린다(지우기 결과와 바뀜 알림의 보기가 엇갈려 도착해도 지운 줄이 되살아나지 않게).
 * 로그에는 건수만 남긴다(문장은 내용이다).
 */
export function createNaturalService(d: NaturalServiceDeps): NaturalService {
  let rev = 0
  const listeners = new Set<() => void>()
  const changed = (): void => {
    for (const cb of listeners) cb()
  }

  const handlePick = createPickHandler({
    usage: {
      record: (id) => {
        rev++
        return d.usage.record(id)
      }
    },
    phrases: {
      learn: (key, id) => {
        rev++
        return d.phrases.learn(key, id)
      }
    },
    pack: async () => (await d.intents()).pack,
    notify: d.notify,
    log: d.log
  })

  const view = async (): Promise<NaturalView> => {
    const at = rev
    // 저장소 읽기를 먼저 줄에 넣는다(항목 목록을 만드는 사이에 들어온 변경은 다음 rev의 보기가 담는다)
    const [entries, usage, intents, items] = await Promise.all([d.phrases.entries(), d.usage.all(), d.intents(), d.items()])
    return buildNaturalView({ rev: at, entries, phraseMax: PHRASE_MAX, usageCount: usage.size, intents, items })
  }

  /** 지우기 하나: rev를 올리고 저장소 줄에 넣은 뒤, 건수를 남기고 바뀌었으면 알린다 */
  const change = async (event: 'natural.forget' | 'natural.clearUsage', run: () => Promise<number>): Promise<NaturalChangeResult> => {
    rev++
    const count = await run()
    d.log(event, { count })
    if (count > 0) changed()
    return { ok: true, count, view: await view() }
  }

  return {
    async searchContext() {
      const [intents, learned, usage] = await Promise.all([d.intents(), d.phrases.all(), d.usage.all()])
      return { pack: intents.pack, learned: [...learned], usage: [...usage], now: d.now() }
    },
    async pick(raw) {
      const before = rev
      await handlePick(raw)
      if (rev !== before) changed()
    },
    view,
    forget: (key) => change('natural.forget', async () => ((await d.phrases.remove(key)) ? 1 : 0)),
    forgetAll: () => change('natural.forget', () => d.phrases.clear()),
    clearUsage: () => change('natural.clearUsage', () => d.usage.clear()),
    async openIntents() {
      return { ok: true, opened: await d.openIntents() }
    },
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
  }
}
