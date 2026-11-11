import { expect, it, vi } from 'vitest'
import builtin from '../../../resources/intents.json'
import { parseIntentPack } from '../../shared/natural/intent-pack'
import { NATURAL_NOTES } from '../../shared/natural/natural-view'
import { createNaturalCommands, createPickHandler, naturalCommandItems, openIntentsFile } from './natural-commands'

function cmdDeps(openError = '') {
  const calls: string[] = []
  const d = {
    ensure: vi.fn(async () => (calls.push('ensure'), 'C:/x/intents.json')),
    openFile: vi.fn(async () => (calls.push('openFile'), openError)),
    showInFolder: vi.fn(),
    waitKeysReleased: vi.fn(async () => (calls.push('wait'), true)),
    hidePalette: vi.fn(() => void calls.push('hide')),
    notify: vi.fn(),
    log: vi.fn()
  }
  return { d, calls }
}

it('명령 항목', () => {
  expect(naturalCommandItems()).toMatchObject([{ id: 'cmd.open-intents', group: 'command', title: '말하듯 입력 단어 목록 열기' }])
})

it('열기: 키 떼기 확인 → 숨김(포커스 없이) → ensure → openFile', async () => {
  const { d, calls } = cmdDeps()
  expect(await createNaturalCommands(d).run('cmd.open-intents')).toBe(true)
  expect(calls).toEqual(['wait', 'hide', 'ensure', 'openFile'])
  expect(d.hidePalette).toHaveBeenCalledWith(false)
  expect(d.showInFolder).not.toHaveBeenCalled()
  expect(d.log).toHaveBeenCalledWith('natural.openIntents', { opened: true })
})

it('열기 실패면 폴더를 열고 알린다', async () => {
  const { d } = cmdDeps('no app')
  await createNaturalCommands(d).run('cmd.open-intents')
  expect(d.showInFolder).toHaveBeenCalledWith('C:/x/intents.json')
  expect(d.notify).toHaveBeenCalledWith('단어 목록 파일(.json)을 열 프로그램이 없어 폴더를 열었어요. 메모장으로 열어 고쳐 주세요.')
  expect(d.log).toHaveBeenCalledWith('natural.openIntents', { opened: false })
})

it('설정 창의 [단어 목록 파일 열기]는 같은 흐름에서 키 확인·팔레트 숨김만 뺀다: ensure → openFile, 열었으면 true', async () => {
  const { d, calls } = cmdDeps()
  expect(await openIntentsFile(d)).toBe(true)
  expect(calls).toEqual(['ensure', 'openFile'])
  expect(d.showInFolder).not.toHaveBeenCalled()
  expect(d.log).toHaveBeenCalledWith('natural.openIntents', { opened: true })
})

it('설정 창에서도 열 프로그램이 없으면 폴더를 열고 같은 알림을 띄우며 false(화면에 같은 문구를 쓴다)', async () => {
  const { d } = cmdDeps('no app')
  expect(await openIntentsFile(d)).toBe(false)
  expect(d.showInFolder).toHaveBeenCalledWith('C:/x/intents.json')
  expect(d.notify).toHaveBeenCalledWith(NATURAL_NOTES.openFallback)
  expect(NATURAL_NOTES.openFallback).toBe('단어 목록 파일(.json)을 열 프로그램이 없어 폴더를 열었어요. 메모장으로 열어 고쳐 주세요.')
  expect(d.log).toHaveBeenCalledWith('natural.openIntents', { opened: false })
})

it('키를 못 뗐으면 숨기지 않고, 다른 id는 false', async () => {
  const { d } = cmdDeps()
  d.waitKeysReleased.mockResolvedValue(false)
  await createNaturalCommands(d).run('cmd.open-intents')
  expect(d.hidePalette).not.toHaveBeenCalled()
  expect(await createNaturalCommands(d).run('cmd.other')).toBe(false)
})

function pickDeps() {
  const d = {
    usage: { record: vi.fn(async () => {}) },
    phrases: { learn: vi.fn(async () => {}) },
    pack: async () => parseIntentPack(builtin).pack!,
    notify: vi.fn(),
    log: vi.fn()
  }
  return d
}

it('pick: remember false면 record만', async () => {
  const d = pickDeps()
  await createPickHandler(d)({ id: 'prompt:report', remember: false, query: '보고서 띄워줘' })
  expect(d.usage.record).toHaveBeenCalledWith('prompt:report')
  expect(d.phrases.learn).not.toHaveBeenCalled()
})

it('pick: remember true면 키로 learn하고 알린다. 로그에 문장은 없다', async () => {
  const d = pickDeps()
  await createPickHandler(d)({ id: 'prompt:report', remember: true, query: '보고서 띄워줘' })
  expect(d.phrases.learn).toHaveBeenCalledWith('보고서띄워줘', 'prompt:report')
  expect(d.notify).toHaveBeenCalledTimes(1)
  // 알림에도 문장을 넣지 않는다(Windows 알림 기록에 남는다)
  expect(d.notify).toHaveBeenCalledWith('이 문장을 기억했어요. 다음부터 같은 문장을 입력하면 고른 항목이 맨 위에 와요.')
  expect(JSON.stringify(d.notify.mock.calls)).not.toContain('보고서')
  expect(d.log).toHaveBeenCalledWith('phrase.learn', { keyLength: 6 })
  expect(JSON.stringify(d.log.mock.calls)).not.toContain('보고서')
})

it('pick: key가 null인 문장은 learn하지 않고, 잘못된 값은 무시한다', async () => {
  const d = pickDeps()
  const h = createPickHandler(d)
  await h({ id: 'a', remember: true, query: '회' })
  expect(d.phrases.learn).not.toHaveBeenCalled()
  expect(d.usage.record).toHaveBeenCalledTimes(1)
  await h({ id: 'a', remember: 'yes' })
  await h(null)
  expect(d.usage.record).toHaveBeenCalledTimes(1)
})
