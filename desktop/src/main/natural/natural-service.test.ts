import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import builtin from '../../../resources/intents.json'
import { buildPaletteIndex, searchContextOf, searchPalette } from '../../renderer/src/palette/filter-items'
import { parseIntentPack } from '../../shared/natural/intent-pack'
import type { NaturalChangeResult, NaturalView } from '../../shared/natural/natural-ipc'
import { LEARNED_LABEL } from '../../shared/natural/natural-rank'
import type { IntentState } from '../../shared/natural/natural-view'
import type { PaletteItem } from '../../shared/types'
import { createNaturalService } from './natural-service'
import { createPhraseStore, PHRASE_MAX } from './phrase-store'
import { createUsageStore } from './usage-store'

// 말하듯 입력 데이터(설계 §13 8단계·§9 동점 순서): 팔레트 검색 문맥과 설정 창 탭이 같은 저장소(phrase-map.json·usage.json)를 쓴다.
// 문장·항목 이름은 가상 값이다.

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-natural-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const pack = parseIntentPack(builtin).pack!
const ITEMS: PaletteItem[] = [
  { id: 'workspace:ws-qa', group: 'workspace', title: 'QA 모드' },
  { id: 'prompt:weekly-report', group: 'prompt', title: '주간 보고 초안' },
  { id: 'cmd.unmask', group: 'command', title: '가명 되돌리기' }
]
const NOW = Date.parse('2026-11-11T09:00:00.000Z')
let tick = 0
const clock = (): Date => new Date(NOW + tick++ * 1000)

function setup(o: { intents?: IntentState; opened?: boolean } = {}) {
  const deps = {
    phrases: createPhraseStore(dir, { now: clock }),
    usage: createUsageStore(dir, { now: clock }),
    intents: vi.fn(async (): Promise<IntentState> => o.intents ?? { pack, source: 'builtin', errors: [] }),
    items: vi.fn(async () => ITEMS),
    openIntents: vi.fn(async () => o.opened ?? true),
    notify: vi.fn(),
    log: vi.fn(),
    now: () => NOW
  }
  return { svc: createNaturalService(deps), deps }
}

const keys = (v: NaturalView): string[] => v.phrases.map((p) => p.key)
const viewOf = (r: NaturalChangeResult): NaturalView => {
  if (!r.ok) throw new Error('실패한 결과')
  return r.view
}

/** 가상 문장 셋을 기억시킨다(나중에 기억한 것이 위) */
async function learnThree(d: ReturnType<typeof setup>['deps']): Promise<void> {
  await d.phrases.learn('출근세팅해줘', 'workspace:ws-qa')
  await d.phrases.learn('주간보고띄워줘', 'prompt:weekly-report')
  await d.phrases.learn('지난달보고서열어줘', 'prompt:deleted')
}

describe('설정 창 보기', () => {
  it('기억한 문장(최근 것부터, 항목 이름·구역, 지금 없는 항목은 null)·상한·사용 기록 수·단어 목록', async () => {
    const { svc, deps } = setup()
    await learnThree(deps)
    await deps.usage.record('cmd.unmask')
    await deps.usage.record('workspace:ws-qa')
    const v = await svc.view()
    expect(keys(v)).toEqual(['지난달보고서열어줘', '주간보고띄워줘', '출근세팅해줘'])
    expect(v.phrases[0].item).toBeNull()
    expect(v.phrases[2].item).toEqual({ title: 'QA 모드', group: 'workspace' })
    expect(v.phraseMax).toBe(PHRASE_MAX)
    expect(v.usageCount).toBe(2)
    expect(v.intents).toMatchObject({ source: 'builtin', errors: [], fillers: pack.fillers.length })
  })
})

describe('지우기', () => {
  it('forget은 그 문장만 지우고 지운 수와 새 보기를 준다. 로그는 건수만', async () => {
    const { svc, deps } = setup()
    await learnThree(deps)
    const r = await svc.forget('주간보고띄워줘')
    expect(r).toMatchObject({ ok: true, count: 1 })
    expect(keys(viewOf(r))).toEqual(['지난달보고서열어줘', '출근세팅해줘'])
    expect(deps.log).toHaveBeenCalledWith('natural.forget', { count: 1 })
    expect([...(await deps.phrases.all()).keys()]).toEqual(['출근세팅해줘', '지난달보고서열어줘'])
  })

  it('없는 문장(다른 곳에서 이미 지움)은 0건이고 바뀜을 알리지 않는다', async () => {
    const { svc, deps } = setup()
    const changes = vi.fn()
    svc.onChange(changes)
    expect(await svc.forget('없는문장')).toMatchObject({ ok: true, count: 0 })
    expect(deps.log).toHaveBeenCalledWith('natural.forget', { count: 0 })
    expect(changes).not.toHaveBeenCalled()
  })

  it('forgetAll은 모두 지우고 지운 수를 준다(같은 로그 이름, 건수만)', async () => {
    const { svc, deps } = setup()
    await learnThree(deps)
    const r = await svc.forgetAll()
    expect(r).toMatchObject({ ok: true, count: 3 })
    expect(keys(viewOf(r))).toEqual([])
    expect(deps.log).toHaveBeenCalledWith('natural.forget', { count: 3 })
  })

  it('clearUsage는 사용 기록만 지우고 지운 수를 준다(기억한 문장은 그대로)', async () => {
    const { svc, deps } = setup()
    await learnThree(deps)
    await deps.usage.record('cmd.unmask')
    await deps.usage.record('prompt:weekly-report')
    const r = await svc.clearUsage()
    expect(r).toMatchObject({ ok: true, count: 2 })
    expect(viewOf(r).usageCount).toBe(0)
    expect(keys(viewOf(r))).toHaveLength(3)
    expect(deps.log).toHaveBeenCalledWith('natural.clearUsage', { count: 2 })
  })

  it('저장하지 못하면 던진다(IPC가 오류 문구 없이 실패로 답한다)', async () => {
    const { svc, deps } = setup()
    deps.phrases.remove = vi.fn(async () => {
      throw new Error('EPERM')
    })
    await expect(svc.forget('출근세팅해줘')).rejects.toThrow('EPERM')
  })
})

describe('팔레트는 지운 내용을 다음 검색부터 쓰지 않는다(검색 문맥은 팔레트를 보일 때마다 새로 받는다)', () => {
  const index = buildPaletteIndex(ITEMS)

  it('지운 문장은 다음 검색 문맥에 없어 그 항목이 기억한 문장으로 맨 위에 오지 않는다', async () => {
    const { svc, deps } = setup()
    await deps.phrases.learn('출근세팅해줘', 'workspace:ws-qa')
    const before = searchContextOf(await svc.searchContext())
    expect(searchPalette(ITEMS, '출근 세팅해줘', index, before).top).toEqual({ id: 'workspace:ws-qa', label: LEARNED_LABEL })

    await svc.forget('출근세팅해줘')
    const after = searchContextOf(await svc.searchContext())
    expect(after.learned.has('출근세팅해줘')).toBe(false)
    expect(searchPalette(ITEMS, '출근 세팅해줘', index, after).top?.label).not.toBe(LEARNED_LABEL)
  })

  it('모두 지우면 기억한 문장이 하나도 없고, 사용 기록을 지우면 빈 화면의 최근 항목이 없다', async () => {
    const { svc, deps } = setup()
    await learnThree(deps)
    await deps.usage.record('cmd.unmask')
    await deps.usage.record('workspace:ws-qa')
    expect(searchPalette(ITEMS, '', index, searchContextOf(await svc.searchContext())).recent).toEqual(['workspace:ws-qa', 'cmd.unmask'])

    await svc.forgetAll()
    await svc.clearUsage()
    const ctx = await svc.searchContext()
    expect(ctx.learned).toEqual([])
    expect(ctx.usage).toEqual([])
    expect(ctx.pack).toBe(pack)
    expect(ctx.now).toBe(NOW)
    expect(searchPalette(ITEMS, '', index, searchContextOf(ctx)).recent).toEqual([])
  })
})

describe('바뀜 알림과 rev(열린 설정 창이 새 보기를 받는다)', () => {
  it('팔레트 선택(사용 기록·기억하기)과 지우기마다 한 번 알리고, 형식이 틀린 선택이나 0건 지우기는 알리지 않는다', async () => {
    const { svc } = setup()
    const changes = vi.fn()
    const off = svc.onChange(changes)
    await svc.pick({ id: 'workspace:ws-qa', remember: true, query: '출근 세팅해줘' })
    expect(changes).toHaveBeenCalledTimes(1)
    expect(keys(await svc.view())).toEqual(['출근세팅해줘'])
    await svc.pick('형식이 틀린 값')
    expect(changes).toHaveBeenCalledTimes(1)
    await svc.forget('출근세팅해줘')
    expect(changes).toHaveBeenCalledTimes(2)
    await svc.clearUsage()
    expect(changes).toHaveBeenCalledTimes(3)
    await svc.forgetAll()
    expect(changes).toHaveBeenCalledTimes(3)
    off()
    await svc.pick({ id: 'cmd.unmask', remember: false })
    expect(changes).toHaveBeenCalledTimes(3)
  })

  it('보기는 바뀔 때마다 rev가 커지고, 지우기 전에 시작한 보기는 지우기 결과보다 rev가 작다(화면은 큰 rev를 남긴다)', async () => {
    const { svc, deps } = setup()
    await learnThree(deps)
    const first = await svc.view()
    // 바뀜 알림의 보기(a)를 만드는 사이에 지우기(b)가 끝나도 b의 보기가 rev가 크고 지운 줄이 없다
    const [a, b] = await Promise.all([svc.view(), svc.forget('주간보고띄워줘')])
    expect(a.rev).toBe(first.rev)
    expect(keys(a)).toContain('주간보고띄워줘')
    expect(viewOf(b).rev).toBeGreaterThan(a.rev)
    expect(keys(viewOf(b))).not.toContain('주간보고띄워줘')
  })
})

it('단어 목록 파일 열기는 같은 흐름의 결과(열었는지)만 준다', async () => {
  expect(await setup().svc.openIntents()).toEqual({ ok: true, opened: true })
  expect(await setup({ opened: false }).svc.openIntents()).toEqual({ ok: true, opened: false })
})

it('로그에는 문장이 없다(건수·길이만): 기억하기·지우기·모두 지우기·사용 기록 지우기', async () => {
  const { svc, deps } = setup()
  await svc.pick({ id: 'workspace:ws-qa', remember: true, query: '출근 세팅해줘' })
  await svc.pick({ id: 'prompt:weekly-report', remember: true, query: '주간 보고 띄워줘' })
  await svc.forget('출근세팅해줘')
  await svc.forgetAll()
  await svc.clearUsage()
  const logged = JSON.stringify(deps.log.mock.calls)
  for (const text of ['출근', '세팅', '주간', '띄워줘', 'QA 모드']) expect(logged).not.toContain(text)
  for (const [, data] of deps.log.mock.calls) {
    for (const v of Object.values(data as Record<string, unknown>)) expect(['number', 'boolean']).toContain(typeof v)
  }
  expect(deps.log.mock.calls.filter(([event]) => event === 'natural.forget').map(([, data]) => data)).toEqual([{ count: 1 }, { count: 1 }])
  expect(deps.log.mock.calls.filter(([event]) => event === 'natural.clearUsage').map(([, data]) => data)).toEqual([{ count: 2 }])
})
