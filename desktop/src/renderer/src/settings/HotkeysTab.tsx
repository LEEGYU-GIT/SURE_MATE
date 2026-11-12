import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import type { AppHotkeyId, SettingsHotkeyId } from '../../../shared/settings/settings-snapshot'
import type { WorkspaceListView } from '../../../shared/workspace/workspace-ipc'
import { Button, type Notice, NoticeLine, Section } from './controls'
import { HotkeyRecorder } from './HotkeyRecorder'
import { changeLabel, clearedNotice, doneNotice, HOTKEYS_COPY as COPY, workspaceHotkeyRows } from './hotkeys-tab-state'
import { focusAfterRemove } from './natural-tab-state'
import { useSettingsCtx } from './use-settings'

const ROWS: { id: AppHotkeyId; label: string; description: string }[] = [
  { id: 'palette', label: '팔레트 열기', description: '프롬프트·용어·상용구·명령을 찾는 팔레트를 열고 닫아요' },
  { id: 'lookup', label: '선택한 글로 용어 찾기', description: '고른 글에 나온 용어를 바 옆 위키 카드로 보여 줘요' },
  { id: 'pet-control', label: '말랑 메이트 조종하기', description: '누르면 키보드로 말랑 메이트를 움직여요' }
]

/** 결과 줄을 둘 곳: 그 단축키 줄, 또는 워크스페이스 구역 아래(단축키를 지운 워크스페이스는 목록에서 빠진다) */
type TabNotice = { at: SettingsHotkeyId | 'workspaces'; notice: Notice }

const workspaceHotkey = (workspaceId: string): SettingsHotkeyId => `workspace:${workspaceId}`
/** 누른 단추·녹화 칸이 사라져 포커스가 문서로 빠졌는지(Tab으로 다른 곳에 갔으면 그대로 둔다) */
const focusLost = (): boolean => !document.activeElement || document.activeElement === document.body

/**
 * 단축키(설계 문서 §6): 전역 단축키(팔레트·용어 찾기·말랑 메이트 조종)와 워크스페이스 단축키의 지금 조합·등록 상태, 바꾸기(녹화),
 * 지우기(워크스페이스), 경고·사용 중 안내. 워크스페이스 단축키는 워크스페이스 탭과 같은 목록을 읽고 바뀌면 따라 그린다.
 * 단축키가 없는 워크스페이스는 수만 보이고 워크스페이스 탭으로 보낸다. 녹화 칸이나 지우기 단추가 사라지면 포커스를 그 줄의 바꾸기
 * 단추(지운 워크스페이스 줄은 그 자리에 온 줄, 없으면 워크스페이스 탭 열기 단추)로 돌려준다(키보드만으로 사용, §16)
 */
export function HotkeysTab(): React.JSX.Element {
  const { snapshot, showTab } = useSettingsCtx()
  const api = window.sureMate.settings
  const [recording, setRecording] = useState<SettingsHotkeyId | null>(null)
  const [notice, setNotice] = useState<TabNotice | null>(null)
  const [list, setList] = useState<WorkspaceListView | null>(null)
  /** 줄마다 바꾸기·정하기 단추 */
  const changeRefs = useRef(new Map<SettingsHotkeyId, HTMLButtonElement>())
  const openTabRef = useRef<HTMLButtonElement>(null)
  const clearing = useRef(false)
  /** 워크스페이스 단축키를 지우는 중: 지우기 전 줄 순서(워크스페이스 id)와 지운 줄. 새 목록에서 그 줄이 빠지면 포커스를 옮긴다 */
  const afterClear = useRef<{ before: string[]; removed: string } | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const v = await window.sureMate.listWorkspaces().catch(() => null)
    if (v) setList(v)
  }, [])

  useEffect(() => {
    let alive = true
    // 구독을 먼저 걸고 읽는다(그 사이 바뀐 목록을 놓치지 않게)
    const off = window.sureMate.onWorkspacesChanged((v) => setList(v))
    window.sureMate
      .listWorkspaces()
      .then((v) => {
        // 그사이 바뀐 목록 알림이 먼저 왔으면 그것이 더 새것이다
        if (alive) setList((prev) => prev ?? v)
      })
      .catch(() => {})
    return () => {
      alive = false
      off()
    }
  }, [])

  // 녹화가 Esc·바꾸기로 끝나면 녹화 칸이 사라진다: 그 줄의 바꾸기 단추로 포커스를 돌려준다
  const wasRecording = useRef<SettingsHotkeyId | null>(null)
  useEffect(() => {
    const was = wasRecording.current
    wasRecording.current = recording
    if (was && !recording && focusLost()) changeRefs.current.get(was)?.focus()
  }, [recording])

  // 지운 워크스페이스 줄이 새 목록에서 빠졌다: 그 자리에 온 줄의 바꾸기 단추로, 남은 줄이 없으면 워크스페이스 탭 열기 단추로
  useEffect(() => {
    const plan = afterClear.current
    if (!plan || !list) return
    const ids = workspaceHotkeyRows(list.items).rows.map((v) => v.workspace.id)
    if (ids.includes(plan.removed)) return
    afterClear.current = null
    if (!focusLost()) return
    const next = focusAfterRemove(plan.before, plan.removed, ids)
    ;(next ? changeRefs.current.get(workspaceHotkey(next)) : openTabRef.current)?.focus()
  }, [list])

  const record = (id: SettingsHotkeyId): void => {
    setNotice(null)
    setRecording(id)
  }

  const done =
    (id: SettingsHotkeyId) =>
    (r: { acc: string; warning?: string } | null): void => {
      setRecording(null)
      if (r) setNotice({ at: id, notice: doneNotice(id, r) })
      // 워크스페이스 단축키는 등록 상태를 바로 받는다(바뀐 목록 알림도 온다)
      if (id.startsWith('workspace:')) void refresh()
    }

  /** 워크스페이스 단축키를 비운다(워크스페이스 탭과 같은 길). 그 줄은 목록에서 빠지므로 결과는 구역 아래에 보인다 */
  const clear = async (workspace: { id: string; name: string }): Promise<void> => {
    if (clearing.current || !list) return
    clearing.current = true
    const id = workspaceHotkey(workspace.id)
    setNotice(null)
    // 답보다 바뀐 목록 알림이 먼저 올 수 있어 보내기 전에 포커스 계획을 세운다
    afterClear.current = { before: workspaceHotkeyRows(list.items).rows.map((v) => v.workspace.id), removed: workspace.id }
    try {
      const r = await api.hotkeySet(id, null)
      if (r.ok) setNotice({ at: 'workspaces', notice: clearedNotice(workspace.name) })
      else {
        afterClear.current = null
        setNotice({ at: id, notice: { tone: 'error', text: r.reason } })
      }
    } catch {
      afterClear.current = null
      setNotice({ at: id, notice: { tone: 'error', text: COPY.clearFailed } })
    } finally {
      clearing.current = false
      void refresh()
    }
  }

  const changeRef =
    (id: SettingsHotkeyId) =>
    (el: HTMLButtonElement | null): void => {
      if (el) changeRefs.current.set(id, el)
      else changeRefs.current.delete(id)
    }

  const noticeAt = (at: TabNotice['at']): Notice | null => (notice?.at === at ? notice.notice : null)
  const ws = list ? workspaceHotkeyRows(list.items) : null
  /** 지운 워크스페이스 단축키의 결과(그 줄은 목록에서 빠졌다) */
  const listNotice = noticeAt('workspaces')

  return (
    <>
      <Section title={COPY.appTitle}>
        {ROWS.map((row) => {
          const h = snapshot.hotkeys[row.id]
          return (
            <HotkeyRow
              key={row.id}
              id={row.id}
              label={row.label}
              description={row.description}
              name={row.label}
              acc={h.acc}
              registered={h.registered}
              recording={recording === row.id}
              notice={noticeAt(row.id)}
              changeRef={changeRef(row.id)}
              onRecord={() => record(row.id)}
              onDone={done(row.id)}
            />
          )
        })}
      </Section>

      <Section title={COPY.workspaceTitle}>
        {!list || !ws ? (
          <p className="px-4 py-3 text-small leading-5 text-fg-2">{COPY.loading}</p>
        ) : (
          <>
            {ws.rows.map((v) => {
              const id = workspaceHotkey(v.workspace.id)
              return (
                <HotkeyRow
                  key={v.workspace.id}
                  id={id}
                  label={v.workspace.name}
                  name={`‘${v.workspace.name}’`}
                  acc={v.workspace.hotkey}
                  registered={v.hotkeyRegistered}
                  recording={recording === id}
                  notice={noticeAt(id)}
                  changeRef={changeRef(id)}
                  onRecord={() => record(id)}
                  onDone={done(id)}
                  onClear={() => void clear({ id: v.workspace.id, name: v.workspace.name })}
                />
              )
            })}
            {listNotice ? <NoticeLine notice={listNotice} className="border-b border-line px-4 py-3 last:border-b-0" /> : null}
            {list.items.length === 0 || ws.without > 0 ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <p className="min-w-48 flex-1 text-small leading-5 text-balance break-keep text-fg-2">
                  {list.items.length === 0 ? COPY.noWorkspaces : COPY.withoutHotkey(ws.without)}
                </p>
                <Button ref={openTabRef} onClick={() => showTab('workspace')}>
                  {COPY.openWorkspaceTab}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Section>
    </>
  )
}

/**
 * 단축키 한 줄: 이름·설명, 지금 조합(없으면 '없음')·등록 상태(등록 못 함은 빨간 글자), 바꾸기(정하기)·지우기, 그 아래 녹화 칸과 결과 줄.
 * 구역 안의 줄은 단추가 같아 조합·상태가 같은 자리에 온다. 창이 좁으면 조합·단추 묶음이 이름 아래로 내려간다(이름이 몇 글자 폭으로
 * 눌리지 않게, 워크스페이스·말랑 메이트 탭의 단축키 줄과 같다)
 */
function HotkeyRow({
  id,
  label,
  description,
  name,
  acc,
  registered,
  recording,
  notice,
  changeRef,
  onRecord,
  onDone,
  onClear
}: {
  id: SettingsHotkeyId
  label: string
  description?: string
  /** 단추 이름의 앞말('팔레트 열기', '‘QA 모드’') */
  name: string
  acc: string | null
  registered: boolean
  recording: boolean
  notice: Notice | null
  changeRef: Ref<HTMLButtonElement>
  onRecord(): void
  onDone(r: { acc: string; warning?: string } | null): void
  /** 워크스페이스 단축키만(팔레트·용어 찾기는 비울 수 없고, 조종 단축키는 말랑 메이트 탭에서 지운다) */
  onClear?(): void
}): React.JSX.Element {
  const labelId = `hotkey-${id}-label`
  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-48 flex-1">
          <div id={labelId} className="truncate text-body leading-5 text-fg">
            {label}
          </div>
          {description ? <div className="mt-0.5 text-small leading-5 text-balance break-keep text-fg-2">{description}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <kbd className={`rounded-control border border-line bg-surface-inset px-2 py-1 font-ui text-small whitespace-nowrap ${acc ? 'text-fg' : 'text-fg-3'}`}>
            {acc ?? COPY.none}
          </kbd>
          <span className={`w-24 shrink-0 text-small whitespace-nowrap ${registered ? 'text-fg-2' : 'text-danger'}`}>
            {acc ? (registered ? COPY.inUse : COPY.notRegistered) : null}
          </span>
          {recording ? null : (
            <div className="flex shrink-0 gap-2">
              <Button ref={changeRef} label={changeLabel(name, acc, registered)} onClick={onRecord}>
                {acc ? COPY.change : COPY.set}
              </Button>
              {acc && onClear ? (
                <Button label={COPY.clearLabel(name)} onClick={onClear}>
                  {COPY.clear}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {recording ? <HotkeyRecorder id={id} labelledBy={labelId} onDone={onDone} /> : null}
      {notice ? <NoticeLine notice={notice} /> : null}
      {acc && !registered && !recording ? <p className="text-small leading-5 break-keep text-danger">{COPY.taken}</p> : null}
    </div>
  )
}
