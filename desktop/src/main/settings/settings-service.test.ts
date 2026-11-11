import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import type { PetSettings } from '../../shared/pet/pet-settings'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings/settings'
import type { SettingsSnapshot } from '../../shared/settings/settings-snapshot'
import { createSettingsService } from './settings-service'
import { loadSettings } from './settings-store'
import { createSettingsWriter } from './settings-writer'

function make(o: { packaged?: boolean; failChange?: boolean } = {}) {
  let settings: Settings = structuredClone(DEFAULT_SETTINGS)
  const logs: [string, Record<string, unknown>][] = []
  const setLoginItem = vi.fn()
  const change = vi.fn(async (update: (cur: Settings) => Settings) => {
    if (o.failChange) throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
    settings = update(settings)
  })
  const svc = createSettingsService({
    current: () => settings,
    change,
    hotkeys: () => ({ palette: { acc: 'Alt+`', registered: true }, lookup: { acc: 'Ctrl+Alt+W', registered: true }, 'pet-control': { acc: null, registered: false } }),
    displays: () => [{ id: '1', label: '주 모니터', primary: true }],
    prompts: () => [{ id: 'meeting-notes', name: '회의록 정리' }],
    packaged: () => o.packaged ?? false,
    setLoginItem,
    log: (e, d) => void logs.push([e, d])
  })
  return { svc, change, setLoginItem, logs, set: (s: Settings) => void (settings = s), get: () => settings }
}

it('스냅숏: 설정과 기본·사용자 AI 대상, 단축키·모니터·프롬프트·설치본 여부', () => {
  const t = make()
  const s = t.svc.snapshot()
  expect(s.settings).toEqual(DEFAULT_SETTINGS)
  expect(s.aiTargets.map((x) => x.id)).toEqual(['claude', 'chatgpt', 'gemini', 'copy'])
  expect(s.hotkeys.palette).toEqual({ acc: 'Alt+`', registered: true })
  expect(s.displays).toHaveLength(1)
  expect(s.prompts[0].id).toBe('meeting-notes')
  expect(s.packaged).toBe(false)
})

it('잘못된 값이면 저장하지 않고 까닭을 돌려준다', async () => {
  const t = make()
  const r = await t.svc.update({ bar: { opacity: 2 } })
  expect(r.ok).toBe(false)
  expect(t.change).not.toHaveBeenCalled()
  expect(t.logs).toEqual([['settings.update.rejected', { errors: 1 }]])
})

it('저장은 그때의 설정(다른 곳에서 바꾼 값 포함)에 보낸 필드만 덮는다', async () => {
  const t = make()
  const r = await t.svc.update({ bar: { opacity: 0.8 } })
  // 저장 차례를 기다리는 사이 트레이에서 가명 처리를 끔으로 바꿨다고 치고, 다음 저장이 그 값을 지키는지 본다
  t.set({ ...t.get(), masking: { ...t.get().masking, mode: 'off' } })
  await t.svc.update({ palette: { display: 'primary' } })
  expect(r.ok).toBe(true)
  expect(t.get().bar.opacity).toBe(0.8)
  expect(t.get().masking.mode).toBe('off')
  expect(t.get().palette.display).toBe('primary')
})

it('로그에는 바꾼 필드 이름만(값 없음)', async () => {
  const t = make()
  await t.svc.update({ masking: { internalDomains: ['intra.example.com'] }, bar: { opacity: 0.8 } })
  expect(t.logs).toEqual([['settings.update', { fields: ['masking.internalDomains', 'bar.opacity'] }]])
  expect(JSON.stringify(t.logs)).not.toContain('intra.example.com')
})

it('말랑 메이트 탭 저장: 보낸 펫 필드만 바꾸고, 로그에는 필드 이름만', async () => {
  const t = make()
  const r = await t.svc.update({ pet: { size: 72, reduceMotion: true } })
  expect(r.ok).toBe(true)
  expect(t.get().pet).toEqual({ ...DEFAULT_SETTINGS.pet, size: 72, reduceMotion: true })
  expect(t.get().bar).toEqual(DEFAULT_SETTINGS.bar)
  expect(t.logs).toHaveLength(1)
  expect(t.logs[0][0]).toBe('settings.update')
  expect(t.logs[0][1]).toEqual({ fields: expect.arrayContaining(['pet.size', 'pet.reduceMotion']) })
  expect(t.logs[0][1].fields).toHaveLength(2)
  // 범위 밖이면 저장하지 않는다(끝값으로 바꾸지 않음)
  expect((await t.svc.update({ pet: { sleepAfterMin: 61 } })).ok).toBe(false)
  expect(t.get().pet.sleepAfterMin).toBe(DEFAULT_SETTINGS.pet.sleepAfterMin)
})

it('로그인 시 자동 실행은 설치본에서만 바로 적용한다', async () => {
  const dev = make()
  await dev.svc.update({ launchAtLogin: false })
  expect(dev.setLoginItem).not.toHaveBeenCalled()
  const packaged = make({ packaged: true })
  await packaged.svc.update({ launchAtLogin: false })
  expect(packaged.setLoginItem).toHaveBeenCalledWith(false)
  await packaged.svc.update({ bar: { opacity: 0.9 } })
  expect(packaged.setLoginItem).toHaveBeenCalledTimes(1)
})

it('파일에 쓰다 던지면 실패로 돌려준다', async () => {
  const t = make({ failChange: true })
  const r = await t.svc.update({ bar: { opacity: 0.8 } })
  expect(r).toEqual({ ok: false, errors: ['설정을 저장하지 못했어요(EACCES)'] })
})

it('changed()는 구독한 화면에 새 스냅숏을 보내고, 구독을 풀면 보내지 않는다', () => {
  const t = make()
  const got: SettingsSnapshot[] = []
  const off = t.svc.onChanged((s) => void got.push(s))
  t.svc.changed()
  off()
  t.svc.changed()
  expect(got).toHaveLength(1)
})

it('설정 창 저장(서비스 → 설정 저장 줄 → settings.json)은 펫 설정을 그대로 두고, 같은 줄의 펫 보이기 바꾸기와 섞이지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sure-mate-service-'))
  try {
    const pet: PetSettings = { visible: false, size: 72, activity: 'lively', sleepAfterMin: 10, bubbles: false, reactions: true, controlHotkey: 'Ctrl+Alt+P', reduceMotion: true }
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ ...DEFAULT_SETTINGS, pet }))
    // 앱 시작과 같이 파일을 읽고, index.ts처럼 설정 서비스의 change를 M5 설정 저장 줄(settings-writer)에 잇는다
    let settings = await loadSettings(dir)
    const writer = createSettingsWriter({ dir: () => dir, current: () => settings, apply: (next) => void (settings = next), notify: vi.fn(), log: vi.fn() })
    const svc = createSettingsService({
      current: () => settings,
      change: writer.change,
      hotkeys: () => ({ palette: { acc: 'Alt+`', registered: true }, lookup: { acc: 'Ctrl+Alt+W', registered: true }, 'pet-control': { acc: null, registered: false } }),
      displays: () => [],
      prompts: () => [],
      packaged: () => false,
      setLoginItem: vi.fn(),
      log: vi.fn()
    })
    // 설정 창 저장 두 번 사이에 바 메뉴의 펫 보이기 바꾸기가 끼어든다
    const [a, , b] = await Promise.all([svc.update({ bar: { opacity: 0.8 } }), writer.togglePet(), svc.update({ masking: { mode: 'off' }, onboardingDone: true })])
    expect(a.ok && b.ok).toBe(true)
    const file = await loadSettings(dir)
    expect(file.pet).toEqual({ ...pet, visible: true })
    expect(file.bar.opacity).toBe(0.8)
    expect(file.masking.mode).toBe('off')
    expect(file.onboardingDone).toBe(true)
    expect(settings).toEqual(file)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
