import { describe, expect, it, vi } from 'vitest'
import type { FlyoutAction } from '../../shared/flyout/flyout-content'
import { BAR_ACTION_FAILED, BAR_ACTION_GUARD_MS, createBarActions, createFlyoutActions } from './bar-actions'

function make(o: { known?: (id: string) => boolean; runPrompt?: (templateId: string) => Promise<unknown> } = {}) {
  let clock = 1000
  const calls: string[] = []
  const log = vi.fn()
  const notify = vi.fn()
  const d = {
    isKnown: vi.fn(o.known ?? (() => true)),
    togglePalette: vi.fn(() => void calls.push('togglePalette')),
    openPalette: vi.fn((p: unknown) => void calls.push(`openPalette ${JSON.stringify(p)}`)),
    toggleMenu: vi.fn((kind: string, itemId: string) => void calls.push(`toggleMenu ${kind} ${itemId}`)),
    runPrompt: vi.fn(async (templateId: string) => {
      calls.push(`runPrompt ${templateId}`)
      return o.runPrompt ? o.runPrompt(templateId) : 'ran'
    }),
    setBusy: vi.fn((id: string | null) => void calls.push(`setBusy ${id}`)),
    togglePet: vi.fn(async () => void calls.push('togglePet')),
    openSettings: vi.fn(async () => void calls.push('openSettings')),
    notify,
    log
  }
  const actions = createBarActions(d, () => clock)
  return { d, actions, calls, log, notify, advance: (ms: number) => void (clock += ms) }
}

describe('createBarActions: 바 단추', () => {
  it('항목마다 맞는 일을 한다(로고는 단축키와 같은 팔레트 열고 닫기, 용어 사전은 ?로 연 팔레트)', async () => {
    const t = make()
    for (const id of ['logo', 'masking', 'workspace', 'glossary', 'pet', 'settings']) await t.actions.run(id)
    expect(t.calls).toEqual([
      'togglePalette',
      'toggleMenu masking-menu masking',
      'toggleMenu workspace-menu workspace',
      `openPalette ${JSON.stringify({ mode: 'search', query: '?' })}`,
      'togglePet',
      'openSettings'
    ])
    expect(t.notify).not.toHaveBeenCalled()
  })

  it('고정 프롬프트: 실행 중 표시 → 선택 글로 실행 → 표시 끄기', async () => {
    const t = make()
    await t.actions.run('prompt:meeting-notes')
    expect(t.calls).toEqual(['setBusy prompt:meeting-notes', 'runPrompt meeting-notes', 'setBusy null'])
  })

  it('실행이 실패해도 표시를 끄고, 던지지 않으며 오류 코드만 기록하고 알린다', async () => {
    const secret = '가상자동차 회의록 원문'
    const t = make({ runPrompt: async () => Promise.reject(Object.assign(new Error(`clipboard failed: ${secret}`), { code: 'EBUSY' })) })
    await expect(t.actions.run('prompt:meeting-notes')).resolves.toBeUndefined()
    expect(t.calls).toEqual(['setBusy prompt:meeting-notes', 'runPrompt meeting-notes', 'setBusy null'])
    expect(t.log).toHaveBeenCalledWith('bar.action.failed', { id: 'prompt:meeting-notes', error: 'EBUSY' })
    expect(JSON.stringify(t.log.mock.calls)).not.toContain(secret)
    expect(t.notify).toHaveBeenCalledTimes(1)
    expect(t.notify).toHaveBeenCalledWith(BAR_ACTION_FAILED)
  })

  it('펫·설정이 실패해도 던지지 않고 알린다', async () => {
    const t = make()
    t.d.togglePet.mockRejectedValueOnce(new Error('EPERM'))
    t.d.openSettings.mockRejectedValueOnce(new Error('EPERM'))
    await expect(t.actions.run('pet')).resolves.toBeUndefined()
    await expect(t.actions.run('settings')).resolves.toBeUndefined()
    expect(t.log.mock.calls.filter(([e]) => e === 'bar.action.failed').map(([, data]) => data)).toEqual([
      { id: 'pet', error: 'Error' },
      { id: 'settings', error: 'Error' }
    ])
    expect(t.notify).toHaveBeenCalledTimes(2)
  })

  it(`같은 단추를 ${BAR_ACTION_GUARD_MS}ms 안에 두 번 누르면 한 번만(설계 Review Focus 3), 지나면 다시`, async () => {
    const t = make()
    await t.actions.run('prompt:meeting-notes')
    t.advance(BAR_ACTION_GUARD_MS - 1)
    await t.actions.run('prompt:meeting-notes')
    expect(t.d.runPrompt).toHaveBeenCalledTimes(1)
    t.advance(1)
    await t.actions.run('prompt:meeting-notes')
    expect(t.d.runPrompt).toHaveBeenCalledTimes(2)
    // 메뉴 단추를 두 번 빨리 눌러 열자마자 닫히지 않게
    await t.actions.run('masking')
    await t.actions.run('masking')
    expect(t.d.toggleMenu).toHaveBeenCalledTimes(1)
    // 다른 단추는 막지 않는다
    await t.actions.run('logo')
    expect(t.d.togglePalette).toHaveBeenCalledTimes(1)
  })

  it('실행 중에 다른 고정 프롬프트를 누르면 실행은 세션이 막고(busy), 먼저 누른 단추의 실행 중 표시는 끝날 때까지 남는다', async () => {
    let finish: (v: unknown) => void = () => {}
    const t = make({ runPrompt: (id) => (id === 'meeting-notes' ? new Promise((resolve) => (finish = resolve)) : Promise.resolve('busy')) })
    const first = t.actions.run('prompt:meeting-notes')
    await Promise.resolve()
    await t.actions.run('prompt:static-analysis')
    expect(t.calls).toEqual(['setBusy prompt:meeting-notes', 'runPrompt meeting-notes', 'runPrompt static-analysis'])
    finish('ran')
    await first
    expect(t.calls.at(-1)).toBe('setBusy null')
    expect(t.d.setBusy).toHaveBeenCalledTimes(2)
  })

  it('바에 없는 id는 아무것도 하지 않고 길이만 기록한다', async () => {
    const t = make({ known: (id) => id !== 'prompt:지운 프롬프트' })
    await t.actions.run('prompt:지운 프롬프트')
    expect(t.calls).toEqual([])
    expect(t.log).toHaveBeenCalledWith('bar.action.unknown', { length: 'prompt:지운 프롬프트'.length })
    expect(JSON.stringify(t.log.mock.calls)).not.toContain('지운')
  })

  it('누른 단추는 id만 기록한다', async () => {
    const t = make()
    await t.actions.run('glossary')
    expect(t.log).toHaveBeenCalledWith('bar.action', { id: 'glossary' })
  })

  it('실행한 방식이 오면 함께 기록한다(up-only: Windows가 누름을 보내지 않은 상태를 로그로 알 수 있다)', async () => {
    const t = make()
    await t.actions.run('pet', 'up-only')
    expect(t.log).toHaveBeenCalledWith('bar.action', { id: 'pet', press: 'up-only' })
  })
})

function makeFlyout() {
  const calls: string[] = []
  const log = vi.fn()
  const notify = vi.fn()
  const d = {
    setMaskingMode: vi.fn(async (mode: string) => void calls.push(`setMaskingMode ${mode}`)),
    saveBarShape: vi.fn(async (shape: string) => void calls.push(`saveBarShape ${shape}`)),
    unsnoozeBar: vi.fn(() => void calls.push('unsnoozeBar')),
    snoozeBar: vi.fn(() => void calls.push('snoozeBar')),
    openSettings: vi.fn(async () => void calls.push('openSettings')),
    close: vi.fn((reason: string) => void calls.push(`close ${reason}`)),
    copyWiki: vi.fn(async (id: string) => {
      calls.push(`copyWiki ${id}`)
      return id !== 'gone'
    }),
    pinCard: vi.fn((pinned: boolean) => void calls.push(`pinCard ${pinned}`)),
    openPalette: vi.fn((p: unknown) => void calls.push(`openPalette ${JSON.stringify(p)}`)),
    lookupClipboard: vi.fn(async () => void calls.push('lookupClipboard')),
    workspaceAction: vi.fn(async (a: { type: string }) => {
      calls.push(`workspace ${a.type}`)
      return true
    }),
    notify,
    log
  }
  return { d, actions: createFlyoutActions(d), calls, log, notify }
}

describe('createFlyoutActions: 펼침 창 메뉴 행', () => {
  it('워크스페이스 행: 메뉴를 닫은 뒤 동작을 넘기고, 기록에는 종류만 남긴다(이름·id 없음)', async () => {
    const t = makeFlyout()
    for (const a of [{ type: 'workspace-run', id: 'ws-qa' }, { type: 'workspace-save' }, { type: 'workspace-edit' }] as FlyoutAction[]) await t.actions.run(a)
    expect(t.calls).toEqual(['close select', 'workspace workspace-run', 'close select', 'workspace workspace-save', 'close select', 'workspace workspace-edit'])
    expect(t.log).toHaveBeenCalledWith('flyout.action', { type: 'workspace-run' })
    expect(JSON.stringify(t.log.mock.calls)).not.toContain('ws-qa')
  })

  it('(A-I1) 워크스페이스 행은 불러오기·저장이 끝나기를 기다리지 않는다: 메뉴를 닫고 시작한 뒤 바로 처리했다고 답해 펼침 창의 다른 단추가 막히지 않는다', async () => {
    const t = makeFlyout()
    // 불러오기(2~10초)나 다른 모니터 구성 질문이 아직 끝나지 않았다
    let finish: (v: boolean) => void = () => {}
    t.d.workspaceAction.mockImplementationOnce(async (a: { type: string }) => {
      t.calls.push(`workspace ${a.type}`)
      return new Promise<boolean>((resolve) => (finish = resolve))
    })
    let answered: boolean | null = null
    const run = t.actions.run({ type: 'workspace-run', id: 'ws-qa' }).then((v) => (answered = v))
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(answered).toBe(true)
    expect(t.calls).toEqual(['close select', 'workspace workspace-run'])
    expect(t.log).toHaveBeenCalledWith('flyout.action', { type: 'workspace-run' })
    // 그동안 다른 메뉴 동작도 처리한다
    expect(await t.actions.run({ type: 'set-masking', mode: 'restore' })).toBe(true)
    finish(true)
    await run
    expect(t.notify).not.toHaveBeenCalled()
  })

  it('(A-I1) 기다리지 않은 워크스페이스 동작이 실패하면 오류 코드만 기록하고 알린다(처리하지 못한 거부가 남지 않는다)', async () => {
    const t = makeFlyout()
    t.d.workspaceAction.mockRejectedValueOnce(Object.assign(new Error('handoff failed: 가상자동차'), { code: 'EPERM' }))
    expect(await t.actions.run({ type: 'workspace-save' })).toBe(true)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(t.log).toHaveBeenCalledWith('flyout.action.failed', { type: 'workspace-save', error: 'EPERM' })
    expect(t.notify).toHaveBeenCalledWith(BAR_ACTION_FAILED)
    expect(JSON.stringify(t.log.mock.calls)).not.toContain('가상자동차')
  })

  it('가명 처리 모드: 저장(설정·트레이·바 갱신) 뒤 메뉴를 닫는다', async () => {
    const t = makeFlyout()
    expect(await t.actions.run({ type: 'set-masking', mode: 'off' })).toBe(true)
    expect(t.calls).toEqual(['setMaskingMode off', 'close select'])
    expect(t.log).toHaveBeenCalledWith('flyout.action', { type: 'set-masking', mode: 'off' })
  })

  it('바 모양: 저장 뒤 잠시 숨김을 풀고 메뉴를 닫는다', async () => {
    const t = makeFlyout()
    expect(await t.actions.run({ type: 'set-bar-shape', shape: 'capsule' })).toBe(true)
    expect(t.calls).toEqual(['saveBarShape capsule', 'unsnoozeBar', 'close select'])
  })

  it('잠시 숨기기·설정 열기는 메뉴를 먼저 닫고, 닫기 단추는 닫기만', async () => {
    const t = makeFlyout()
    expect(await t.actions.run({ type: 'snooze-bar' })).toBe(true)
    expect(await t.actions.run({ type: 'open-settings' })).toBe(true)
    expect(await t.actions.run({ type: 'close' })).toBe(true)
    expect(t.calls).toEqual(['close select', 'snoozeBar', 'close select', 'openSettings', 'close button'])
  })

  it('위키 카드 [설명 복사]: 설명만 복사하고 카드는 그대로 둔다(결과 true). 용어가 없어졌으면 false(카드가 알린다)', async () => {
    const t = makeFlyout()
    expect(await t.actions.run({ type: 'wiki-copy', id: 'mcdc' })).toBe(true)
    expect(await t.actions.run({ type: 'wiki-copy', id: 'gone' })).toBe(false)
    expect(t.calls).toEqual(['copyWiki mcdc', 'copyWiki gone'])
    expect(t.log).toHaveBeenCalledWith('flyout.action', { type: 'wiki-copy' })
    expect(t.notify).not.toHaveBeenCalled()
  })

  it('위키 카드 [고정]: 펼침 창 고정을 바꾸고 카드는 그대로', async () => {
    const t = makeFlyout()
    expect(await t.actions.run({ type: 'wiki-pin', pinned: true })).toBe(true)
    expect(await t.actions.run({ type: 'wiki-pin', pinned: false })).toBe(true)
    expect(t.calls).toEqual(['pinCard true', 'pinCard false'])
  })

  it('위키 카드 [팔레트에서 열기]: 카드를 닫고 팔레트가 그 용어 상세를 연다', async () => {
    const t = makeFlyout()
    expect(await t.actions.run({ type: 'wiki-open', id: 'mcdc' })).toBe(true)
    expect(t.calls).toEqual(['close palette', `openPalette ${JSON.stringify({ mode: 'wiki', id: 'mcdc' })}`])
  })

  it('위키 카드 [팔레트에서 찾기]: 카드를 닫고 ?검색어로 팔레트를 연다(검색어가 없으면 ?만)', async () => {
    const t = makeFlyout()
    expect(await t.actions.run({ type: 'wiki-search', query: 'XY방산 시험' })).toBe(true)
    expect(await t.actions.run({ type: 'wiki-search', query: '' })).toBe(true)
    expect(t.calls).toEqual([
      'close palette',
      `openPalette ${JSON.stringify({ mode: 'search', query: '?XY방산 시험' })}`,
      'close palette',
      `openPalette ${JSON.stringify({ mode: 'search', query: '?' })}`
    ])
    // 검색어(선택한 글일 수 있다)는 기록하지 않는다
    expect(JSON.stringify(t.log.mock.calls)).not.toContain('XY방산')
  })

  it('위키 카드 [클립보드 글로 찾기]: 클립보드 글로 다시 찾는다(새 카드가 이 카드를 바꾼다)', async () => {
    const t = makeFlyout()
    expect(await t.actions.run({ type: 'wiki-clipboard' })).toBe(true)
    expect(t.calls).toEqual(['lookupClipboard'])
  })

  it('위키 카드 단추가 실패하면 false, 카드를 닫고 오류 코드만 기록하고 알린다', async () => {
    const t = makeFlyout()
    t.d.copyWiki.mockRejectedValueOnce(Object.assign(new Error('clipboard busy: 가상자동차'), { code: 'EBUSY' }))
    expect(await t.actions.run({ type: 'wiki-copy', id: 'mcdc' })).toBe(false)
    expect(t.log).toHaveBeenCalledWith('flyout.action.failed', { type: 'wiki-copy', error: 'EBUSY' })
    expect(t.calls.at(-1)).toBe('close error')
    expect(t.notify).toHaveBeenCalledWith(BAR_ACTION_FAILED)
    expect(JSON.stringify(t.log.mock.calls)).not.toContain('가상자동차')
  })

  it('모든 위키 카드 동작이 처리된다(빠진 것이 없다)', async () => {
    const t = makeFlyout()
    const wiki: FlyoutAction[] = [
      { type: 'wiki-copy', id: 'mcdc' },
      { type: 'wiki-pin', pinned: true },
      { type: 'wiki-open', id: 'mcdc' },
      { type: 'wiki-search', query: 'mcdc' },
      { type: 'wiki-clipboard' }
    ]
    for (const a of wiki) expect(await t.actions.run(a), a.type).toBe(true)
  })

  it('처리하다 실패하면 false, 메뉴를 닫고 오류 코드만 기록하고 알린다', async () => {
    const t = makeFlyout()
    t.d.setMaskingMode.mockRejectedValueOnce(Object.assign(new Error('EPERM: ~/settings.json'), { code: 'EPERM' }))
    expect(await t.actions.run({ type: 'set-masking', mode: 'remove' })).toBe(false)
    expect(t.calls).toEqual(['close error'])
    expect(t.log).toHaveBeenCalledWith('flyout.action.failed', { type: 'set-masking', error: 'EPERM' })
    expect(t.notify).toHaveBeenCalledWith(BAR_ACTION_FAILED)
  })
})
