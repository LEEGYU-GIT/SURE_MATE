import { allAiTargets } from '../../shared/ai-targets'
import type { Settings } from '../../shared/settings/settings'
import { applySettingsPatch, validateSettingsPatch, type SettingsPatch } from '../../shared/settings/settings-patch'
import type { SettingsSnapshot, SettingsUpdateResult } from '../../shared/settings/settings-snapshot'
import { errorCode } from '../error-text'

export interface SettingsServiceDeps {
  current(): Settings
  /** 설정 저장 차례를 기다려 파일을 다시 읽고 update를 적용한다(settings-writer) */
  change(update: (cur: Settings) => Settings): Promise<void>
  hotkeys(): SettingsSnapshot['hotkeys']
  displays(): SettingsSnapshot['displays']
  prompts(): SettingsSnapshot['prompts']
  packaged(): boolean
  setLoginItem(open: boolean): void
  /** 바꾼 필드 이름·개수만(값 금지: 사내 도메인·AI 주소 등이 들어 있다) */
  log(event: string, data: Record<string, unknown>): void
}

export interface SettingsService {
  snapshot(): SettingsSnapshot
  update(raw: unknown): Promise<SettingsUpdateResult>
  /** 설정이 바뀌었다(어디서든). 구독한 설정 창에 새 스냅숏을 보낸다 */
  changed(): void
  onChanged(cb: (s: SettingsSnapshot) => void): () => void
}

/** 패치에 든 필드 이름(로그용, 'bar.opacity'처럼) */
function fieldsOf(p: SettingsPatch): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(p)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && k !== 'palette') for (const sub of Object.keys(v)) out.push(`${k}.${sub}`)
    else out.push(k === 'palette' ? 'palette.display' : k)
  }
  return out
}

/**
 * 설정 창의 읽기·저장(설계 문서 §14). 저장은 보낸 필드만 그때의 설정에 덮으므로, 설정 창이 열린 동안
 * 트레이·바 메뉴로 바꾼 값을 되돌리지 않는다. 로그인 시 자동 실행은 설치본에서만 바로 적용한다.
 */
export function createSettingsService(d: SettingsServiceDeps): SettingsService {
  const listeners = new Set<(s: SettingsSnapshot) => void>()
  const snapshot = (): SettingsSnapshot => {
    const settings = d.current()
    return {
      settings,
      aiTargets: allAiTargets(settings.ai.custom),
      hotkeys: d.hotkeys(),
      displays: d.displays(),
      prompts: d.prompts(),
      packaged: d.packaged()
    }
  }
  return {
    snapshot,
    async update(raw) {
      const v = validateSettingsPatch(raw, d.current())
      if (!v.ok) {
        d.log('settings.update.rejected', { errors: v.errors.length })
        return { ok: false, errors: v.errors }
      }
      try {
        await d.change((cur) => applySettingsPatch(cur, v.patch))
      } catch (e) {
        d.log('settings.update.failed', { error: errorCode(e) })
        return { ok: false, errors: [`설정을 저장하지 못했어요(${errorCode(e)})`] }
      }
      if (v.patch.launchAtLogin !== undefined && d.packaged()) d.setLoginItem(v.patch.launchAtLogin)
      d.log('settings.update', { fields: fieldsOf(v.patch) })
      return { ok: true, snapshot: snapshot() }
    },
    changed() {
      const s = snapshot()
      for (const cb of listeners) cb(s)
    },
    onChanged(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
  }
}
