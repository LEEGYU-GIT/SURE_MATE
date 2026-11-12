import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { isImeComposing } from '../../../shared/ime'
import { isSettingsTabId } from '../../../shared/settings/settings-route'
import { parseWorkspaceId } from '../../../shared/workspace/workspace-ipc'
import { AiTab } from './AiTab'
import { BarTab } from './BarTab'
import { GeneralTab } from './GeneralTab'
import { GlossaryTab } from './GlossaryTab'
import { HotkeysTab } from './HotkeysTab'
import { MaskingTab } from './MaskingTab'
import { NaturalTab } from './NaturalTab'
import { PetTab } from './PetTab'
import { PromptsTab } from './PromptsTab'
import { navKey, SETTINGS_TABS, type SettingsTabId } from './tabs'
import { SettingsContext, useSettingsState, type SettingsCtx } from './use-settings'
import { WorkspaceTab } from './WorkspaceTab'

/** 탭별 화면. 아직 없는 탭은 '준비 중' */
const VIEWS: Partial<Record<SettingsTabId, ComponentType>> = {
  general: GeneralTab,
  hotkeys: HotkeysTab,
  ai: AiTab,
  prompts: PromptsTab,
  masking: MaskingTab,
  glossary: GlossaryTab,
  workspace: WorkspaceTab,
  bar: BarTab,
  pet: PetTab,
  natural: NaturalTab
}

/**
 * #/settings 설정 창(설계 문서 §14). 왼쪽 탭 목록(↑↓·Home·End), 오른쪽 내용, 아래 상태 줄.
 * 바꾼 값은 그 자리에서 저장한다(바꾼 필드만 보내 다른 곳에서 바꾼 값을 덮지 않는다).
 */
export function SettingsApp({
  initialTab = 'general',
  initialWorkspace = null
}: {
  initialTab?: SettingsTabId
  /** 워크스페이스 탭에서 처음 열 워크스페이스('#/settings?tab=workspace&ws=<id>') */
  initialWorkspace?: string | null
}): React.JSX.Element {
  const { state, save, track } = useSettingsState()
  const [tab, setTab] = useState<SettingsTabId>(initialTab)
  // main이 열라고 한 워크스페이스. 같은 id를 다시 보내도(팔레트에서 또 Ctrl+Enter) 탭이 그 워크스페이스로 가게 seq를 올린다
  const [workspaceTarget, setWorkspaceTarget] = useState<SettingsCtx['workspaceTarget']>(() =>
    initialTab === 'workspace' && initialWorkspace ? { id: initialWorkspace, seq: 1 } : null
  )
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const index = SETTINGS_TABS.findIndex((t) => t.id === tab)
  const View = VIEWS[tab]
  const current = SETTINGS_TABS[index]

  // 탭 안에서 다른 탭으로 간다(단축키 탭의 '워크스페이스 탭 열기'). 누른 단추가 사라지므로 탭 목록의 그 탭으로 포커스를 옮긴다
  const showTab = useCallback((next: SettingsTabId) => {
    setTab(next)
    tabRefs.current[SETTINGS_TABS.findIndex((t) => t.id === next)]?.focus()
  }, [])

  // 열려 있는 설정 창에서 main이 탭을 고르라고 알린다(펫 메뉴 "펫 설정" → 말랑 메이트, 팔레트 Ctrl+Enter → 그 워크스페이스).
  // 창을 다시 읽지 않아 쓰던 값이 남는다. 워크스페이스를 열면 포커스는 그 탭이 이름 칸으로 옮긴다
  useEffect(
    () =>
      window.sureMate.settings.onShowTab((next, ws) => {
        if (!isSettingsTabId(next)) return
        setTab(next)
        const id = next === 'workspace' ? parseWorkspaceId(ws) : null
        if (id) setWorkspaceTarget((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }))
        else tabRefs.current[SETTINGS_TABS.findIndex((t) => t.id === next)]?.focus()
      }),
    []
  )

  return (
    <div className="flex h-full flex-col bg-surface-solid font-ui text-fg select-none">
      {/* 제목 줄: 창 끌기 자리. 오른쪽 140은 Windows 창 단추(titleBarOverlay) 자리 */}
      <header className="flex h-10 shrink-0 items-center gap-2 pr-[140px] pl-4 [-webkit-app-region:drag]">
        <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
        <span className="text-small leading-4 font-semibold text-fg-2">Sure-Mate 설정</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="설정" className="flex w-52 shrink-0 flex-col gap-0.5 px-2 pt-2">
          <div
            role="tablist"
            aria-orientation="vertical"
            className="flex flex-col gap-0.5"
            onKeyDown={(e) => {
              const next = navKey(index, { code: e.code, isComposing: isImeComposing(e.nativeEvent) }, SETTINGS_TABS.length)
              if (next === null) return
              e.preventDefault()
              setTab(SETTINGS_TABS[next].id)
              tabRefs.current[next]?.focus()
            }}
          >
            {SETTINGS_TABS.map((t, i) => {
              const on = t.id === tab
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
                  id={`tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls="settings-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  className={`relative flex h-9 items-center rounded-control px-3 text-left text-body transition-colors duration-(--dur-hover) ${
                    on ? 'bg-row-selected font-semibold text-fg' : 'text-fg-2 hover:bg-row-hover hover:text-fg'
                  }`}
                >
                  {on ? <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-brand" /> : null}
                  {t.label}
                </button>
              )
            })}
          </div>
        </nav>
        <main id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto pr-8 pb-10 pl-6">
          <h2 className="pt-2 pb-5 text-title leading-7 font-semibold text-fg">{current.label}</h2>
          {!state.snapshot ? (
            <p className="text-small text-fg-2">설정을 읽는 중이에요…</p>
          ) : View ? (
            <SettingsContext.Provider value={{ snapshot: state.snapshot, save, revision: state.revision, track, workspaceTarget, showTab }}>
              <div className="flex max-w-[680px] flex-col gap-7">
                <View />
              </div>
            </SettingsContext.Provider>
          ) : (
            <p className="text-small text-fg-2">이 탭은 아직 준비 중이에요.</p>
          )}
        </main>
      </div>
      <footer className="flex h-8 shrink-0 items-center border-t border-line px-4 text-small leading-4" role="status">
        {state.saving > 0 ? (
          <span className="text-fg-2">저장하는 중…</span>
        ) : state.status.kind === 'error' ? (
          <span className="text-danger">{state.status.errors.join(' · ')}</span>
        ) : state.status.kind === 'saved' ? (
          <span className="text-fg-2">저장했어요</span>
        ) : (
          <span className="text-fg-3">바꾼 값은 바로 저장돼요</span>
        )}
      </footer>
    </div>
  )
}
