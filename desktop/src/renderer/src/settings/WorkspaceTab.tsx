import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { isImeComposing } from '../../../shared/ime'
import { withObjectParticle } from '../../../shared/josa'
import { isHideWorkspace } from '../../../shared/workspace/builtin'
import { hideSummary, restoreSummary, saveSummary, skippedParts, WORKSPACE_NOTES } from '../../../shared/workspace/messages'
import { type SavedLayout, type Workspace, WORKSPACE_LIMITS } from '../../../shared/workspace/types'
import type { WorkspaceEditResult, WorkspaceListView, WorkspaceRunResult, WorkspaceSaveResult, WorkspaceView } from '../../../shared/workspace/workspace-ipc'
import { ChevronLeftIcon, ChevronRightIcon, EyeOffIcon, MonitorIcon, TriangleAlertIcon } from '../design/icons'
import { Button, ConfirmButton, type Notice, NoticeLine, Row, Section, TextField, Toggle } from './controls'
import { HotkeyRecorder } from './HotkeyRecorder'
import { monitorLabel } from './monitor-preview'
import { MonitorPreview } from './MonitorPreview'
import { useSettingsCtx } from './use-settings'
import { createFieldCommits, draftFromWorkspace, type DraftField, type FieldCommits, firstLayout, nextMonitor, ruleCaption, type WorkspaceDraft } from './workspace-editor-state'

/**
 * 워크스페이스 탭 문구(design:ux-copy, 해요체). 알림과 같은 문구는 shared/workspace/messages.ts를 쓴다.
 * 따옴표 안 화면 이름(‘제목에 포함’ 등)은 줄이 바뀌어도 갈라지지 않게 띄어쓰기를 줄바꿈 없는 공백(\u00a0)으로 쓴다
 */
const COPY = {
  intro: '창을 원하는 대로 놓고 저장해 두면, 이름이나 단축키로 그 배치를 다시 불러와요.',
  saveNow: '지금 배치 저장',
  saving: '저장하는 중…',
  /** 오른쪽 열에서는 뜻 단위로 줄을 바꾼다(목록에서는 한 줄로 잇는다) */
  blocked: ['보안 프로그램이 창 제어를 막아', '저장하거나 불러올 수 없어요.', '이름·별칭·단축키는 바꿀 수 있어요.'],
  listTitle: (n: number): string => `저장한 워크스페이스 (${n}개)`,
  emptyTitle: '저장한 워크스페이스가 없어요',
  emptyBody: '창을 원하는 대로 놓은 뒤 ‘지금\u00a0배치\u00a0저장’을 누르세요. 팔레트에서 @를 치거나 바의 워크스페이스 단추로도 저장할 수 있어요.',
  windows: (n: number): string => (n > 0 ? `창 ${n}개` : '포함한 창 없음'),
  otherConfig: '다른 모니터 구성',
  inUse: '쓰는 중',
  notRegistered: '등록 못 함',
  loading: '워크스페이스를 읽는 중이에요…',
  back: '목록',
  backLabel: '워크스페이스 목록으로',
  restore: '불러오기',
  restoring: '불러오는 중…',
  identity: '이름과 단축키',
  name: '이름',
  nameDesc: '팔레트와 바 메뉴에 보이는 이름이에요',
  aliases: '별칭',
  aliasesDesc: '쉼표로 나눠요. 팔레트에서 이 말로도 찾아요',
  aliasesPlaceholder: '예: qa, 시험',
  hotkey: '단축키',
  hotkeyDesc: '누르면 이 배치를 바로 불러와요',
  hotkeyDone: (acc: string): string => `이제 ${withObjectParticle(acc)} 누르면 불러와요`,
  hotkeyCleared: '단축키를 지웠어요',
  hotkeyClearFailed: '단축키를 지우지 못했어요. 다시 해 주세요',
  hotkeyTaken: '다른 앱이 이 조합을 쓰고 있어 등록하지 못했어요. 다른 조합으로 바꿔 주세요.',
  none: '없음',
  layout: '창 배치',
  recapture: '지금 배치로 다시 저장',
  layoutHelp: (n: number): string =>
    n > 0 ? `포함한 창 ${n}개를 불러와요. 같은 프로그램 창이 여럿이면 ‘제목에\u00a0포함’으로 구분해요.` : '포함한 창이 없어요. 불러올 창을 하나 이상 체크해 주세요.',
  /** 오른쪽 열(폭 256)에서 뜻 단위로 줄을 바꾼다 */
  recaptureHelp: ['다시 저장하면 창 목록을', '지금 열린 창으로 바꿔요.', '이름·별칭·단축키는 그대로예요.'],
  previewTitle: '미리 보기',
  recaptured: (r: Extract<WorkspaceSaveResult, { ok: true }>): string => [`창 ${r.windows}개 배치로 다시 저장했어요`, ...skippedParts(r.skipped)].join(' · '),
  otherConfigLine: '다른 모니터 구성에서 저장한 배치예요. 불러올 때 주 모니터로 모을지 물어봐요.',
  include: (app: string, title: string): string => `불러올 때 포함: ${app}${title ? `, ${title}` : ''}`,
  maximized: '최대화',
  titlePrefix: '제목에 포함',
  titlePlaceholder: '비우면 모든 제목',
  titleLabel: (app: string): string => `${app} 창 제목에 포함할 글`,
  monitorButton: (label: string): string => `대상 모니터 ${label}. 누르면 다음 모니터로 바꿔요`,
  noRules: '저장한 창이 없어요. ‘지금\u00a0배치로\u00a0다시\u00a0저장’으로 지금 열린 창을 저장해요.',
  previewSummary: (monitors: number, total: number, enabled: number): string => `창 배치 그림: 모니터 ${monitors}대, 창 ${total}개 중 ${enabled}개 포함`,
  inspector: '창 배치 그림과 불러오기',
  removeSection: '지우기',
  removeLabel: '이 워크스페이스 지우기',
  removeDesc: '창 배치와 단축키도 함께 지워요. 되돌릴 수 없어요.',
  remove: '지우기',
  removeArmed: '한 번 더 누르면 지워요',
  removed: (name: string): string => `‘${name}’ 워크스페이스를 지웠어요`,
  removeFailed: '지우지 못했어요. 다시 해 주세요',
  saveFailed: '저장하지 못했어요. 다시 해 주세요',
  cancelled: '불러오기를 그만뒀어요',
  empty: '불러올 창이 없어요. 창 배치에서 창을 하나 이상 체크해 주세요.',
  runFailed: '불러오지 못했어요. 다시 해 주세요',
  // 기본 워크스페이스 '화면 감추기'(2026-11-12, design:ux-copy). 문장마다 줄을 바꾼다
  builtinTitle: '기본 워크스페이스',
  hideAll: '열린 창을 모두 내려요',
  hideKeep: (n: number): string => `창 ${n}개만 남기고 나머지 창은 내려요`,
  hideRestore: (n: number): string => `다시 누르면 내렸던 창 ${n}개를 되돌려요`,
  hideAbout: ['누르면 이 배치만 남고 나머지 창은 모두 내려가요.', '10분 안에 한 번 더 누르면 내렸던 창이 돌아와요.'],
  hideNow: '지금 감추기',
  hideHotkeyDesc: '누르면 바로 감추고, 10분 안에 다시 누르면 되돌려요',
  hiding: '감추는 중…',
  unhide: '내렸던 창 되돌리기',
  unhiding: '되돌리는 중…',
  hideLayoutHelp: (n: number): string =>
    n > 0 ? `남길 창 ${n}개를 불러오고 나머지 창은 내려요. 같은 프로그램 창이 여럿이면 ‘제목에 포함’으로 구분해요.` : '남길 창이 없어 누르면 열린 창을 모두 내려요.',
  hideNoRules: '아직 남길 창이 없어 누르면 열린 창을 모두 내려요. 업무 창을 놓고 ‘지금 배치로 다시 저장’을 누르세요.',
  hideRecaptureHelp: ['다시 저장하면 남길 창을', '지금 열린 창으로 바꿔요.', '이름·별칭·단축키는 그대로예요.'],
  keepOnTopSection: '감추는 동안',
  keepOnTop: '감춘 동안 업무 창을 항상 위에 두기',
  keepOnTopDesc: '메신저 알림 같은 새 창이 업무 창을 덮지 못해요. 다른 창으로 옮기거나 다시 누르면 풀려요.',
  keepOnTopFailed: '저장하지 못했어요. 다시 해 주세요'
} as const

/** main이 열라고 한 워크스페이스는 한 번만 연다(탭을 옮겼다 돌아오면 목록부터) */
const targetSeen = { seq: 0 }

/** 열린 워크스페이스: focus는 처음 포커스를 둘 곳(main이 열었으면 이름 칸, 목록에서 열었으면 목록 단추) */
type Opened = { id: string; focus: 'name' | 'back'; seq: number; notice: Notice | null }

const enabledCount = (ws: Workspace): number => firstLayout(ws)?.windows.filter((w) => w.enabled).length ?? 0

/**
 * 워크스페이스(설계 §11·§14): 목록과 '지금 배치 저장', 하나를 열면 이름·별칭·단축키, 창 배치(창 규칙 목록과 모니터 그림),
 * 지금 배치로 다시 저장·불러오기·지우기. 칸은 설정 창 규칙대로 그 자리에서 저장한다(입력칸은 칸을 떠나거나 조합이 아닌
 * Enter, 체크 상자·모니터 단추는 바로). 저장 오류는 그 칸 아래에 보이고 칸은 적은 글을 그대로 둔다.
 */
export function WorkspaceTab(): React.JSX.Element {
  const { workspaceTarget, track } = useSettingsCtx()
  const api = window.sureMate
  const [data, setData] = useState<WorkspaceListView | null>(null)
  const [opened, setOpened] = useState<Opened | null>(null)
  const [listNotice, setListNotice] = useState<Notice | null>(null)
  const [saving, setSaving] = useState(false)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const saveRef = useRef<HTMLButtonElement>(null)
  /** 목록으로 돌아오면 포커스를 둘 행 */
  const returnTo = useRef<string | null>(null)

  const refresh = useCallback(async (): Promise<WorkspaceListView | null> => {
    const v = await window.sureMate.listWorkspaces().catch(() => null)
    if (v) setData(v)
    return v
  }, [])

  useEffect(() => {
    // 구독을 먼저 걸고 읽는다(그 사이 바뀐 목록을 놓치지 않게)
    const off = window.sureMate.onWorkspacesChanged((v) => setData(v))
    void refresh()
    return off
  }, [refresh])

  // main이 그 워크스페이스를 열라고 했다(팔레트 행의 Ctrl+Enter, 지금 배치 저장 뒤): 이름 칸을 골라 둔다
  useEffect(() => {
    if (!workspaceTarget || workspaceTarget.seq <= targetSeen.seq) return
    targetSeen.seq = workspaceTarget.seq
    setOpened({ id: workspaceTarget.id, focus: 'name', seq: workspaceTarget.seq, notice: null })
  }, [workspaceTarget])

  const item = opened && data ? (data.items.find((i) => i.workspace.id === opened.id) ?? null) : null

  // 연 워크스페이스가 목록에 없다. main은 저장한 뒤 바로 열라고 알리므로 바뀐 목록보다 먼저 올 수 있어 한 번 다시 읽어 보고,
  // 그래도 없으면(다른 곳에서 지움, 잘못된 id) 목록으로 돌아가 알린다
  const [rechecked, setRechecked] = useState<number | null>(null)
  useEffect(() => {
    if (!opened || !data || item) return
    if (rechecked !== opened.seq) {
      const seq = opened.seq
      // 다시 읽지 못해도(답이 없음) 끝나면 한 번 더 판단한다
      void refresh().finally(() => setRechecked(seq))
      return
    }
    setOpened(null)
    setListNotice({ tone: 'error', text: WORKSPACE_NOTES.missing })
  }, [opened, data, item, refresh, rechecked])

  // 목록으로 돌아오면 보던 행(없으면 저장 단추)으로 포커스를 돌려준다(키보드만으로 사용, §16)
  useEffect(() => {
    if (opened || !data || returnTo.current === null) return
    const id = returnTo.current
    returnTo.current = null
    ;(rowRefs.current.get(id) ?? saveRef.current)?.focus()
  }, [opened, data])

  const saveNew = async (): Promise<void> => {
    setSaving(true)
    setListNotice(null)
    const r = await track(() =>
      api.saveWorkspaceNew().catch((): WorkspaceSaveResult => ({ ok: false, reason: 'save-failed', message: WORKSPACE_NOTES.saveFailed }))
    )
    setSaving(false)
    if (!r.ok) {
      setListNotice({ tone: r.reason === 'busy' ? 'warn' : 'error', text: r.message })
      return
    }
    await refresh()
    // 이름('배치 N')을 바로 바꾸게 이름 칸을 골라 둔다
    setOpened({ id: r.id, focus: 'name', seq: Date.now(), notice: { tone: 'ok', text: saveSummary({ name: r.name, windows: r.windows, skipped: r.skipped }) } })
  }

  // 목록을 읽는 중이거나, 연 워크스페이스를 다시 찾는 중(목록이 잠깐 비치지 않게)
  if (!data || (opened && !item)) return <p className="text-small text-fg-2">{COPY.loading}</p>

  if (opened && item) {
    return (
      <WorkspaceDetail
        key={opened.id}
        item={item}
        canControl={data.canControl}
        focus={opened.focus}
        focusSeq={opened.seq}
        notice={opened.notice}
        onRefresh={() => void refresh()}
        onBack={() => {
          returnTo.current = opened.id
          setListNotice(null)
          setOpened(null)
        }}
        onRemoved={(name) => {
          returnTo.current = ''
          setListNotice({ tone: 'ok', text: COPY.removed(name) })
          setOpened(null)
          void refresh()
        }}
      />
    )
  }

  // 저장하는 동안은 busy(aria-disabled): disabled로 바꾸면 포커스를 잃어 저장하지 못했을 때 키보드 자리가 사라진다(A-M8)
  const saveButton = (
    <Button ref={saveRef} kind="primary" disabled={!data.canControl} busy={saving} onClick={() => void saveNew()}>
      {saving ? COPY.saving : COPY.saveNow}
    </Button>
  )

  const row = (v: WorkspaceView): React.JSX.Element => (
    <WorkspaceRow
      key={v.workspace.id}
      view={v}
      ref={(el) => {
        if (el) rowRefs.current.set(v.workspace.id, el)
        else rowRefs.current.delete(v.workspace.id)
      }}
      onOpen={() => {
        setListNotice(null)
        setOpened({ id: v.workspace.id, focus: 'back', seq: Date.now(), notice: null })
      }}
    />
  )
  // 기본 워크스페이스(화면 감추기)는 따로 맨 위 구역에 고정하고, 사용자가 저장한 워크스페이스만 세고 빈 화면을 고른다
  const builtin = data.items.filter((v) => isHideWorkspace(v.workspace.id))
  const saved = data.items.filter((v) => !isHideWorkspace(v.workspace.id))
  const builtinSection = builtin.length > 0 ? <Section title={COPY.builtinTitle}>{builtin.map(row)}</Section> : null

  if (saved.length === 0) {
    return (
      <>
        {builtinSection}
        <div className="flex flex-col items-center gap-4 rounded-window bg-surface-inset px-8 pt-9 pb-8 text-center">
          <EmptyArt />
          <div className="flex flex-col gap-1.5">
            <p className="text-body leading-5 font-semibold text-fg">{COPY.emptyTitle}</p>
            <p className="max-w-[420px] text-small leading-5 text-balance break-keep text-fg-2">{COPY.emptyBody}</p>
          </div>
          {saveButton}
          {!data.canControl ? <NoticeLine notice={{ tone: 'warn', text: COPY.blocked.join(' ') }} className="max-w-[420px] text-balance" /> : null}
          {listNotice ? <NoticeLine notice={listNotice} className="max-w-[420px] text-balance" /> : null}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="min-w-60 flex-1 text-small leading-5 text-balance break-keep text-fg-2">{COPY.intro}</p>
          {saveButton}
        </div>
        {!data.canControl ? <NoticeLine notice={{ tone: 'warn', text: COPY.blocked.join(' ') }} /> : null}
        {listNotice ? <NoticeLine notice={listNotice} /> : null}
      </div>
      {builtinSection}
      <Section title={COPY.listTitle(saved.length)}>{saved.map(row)}</Section>
    </>
  )
}

/** 저장한 배치가 있는지(저장 전의 화면 감추기는 없다: 다른 모니터 구성으로 보이지 않게) */
const hasLayout = (ws: Workspace): boolean => Object.keys(ws.layouts).length > 0

/** 화면 감추기 행·부제: 되돌릴 창이 있으면 다시 누르면 되돌린다고, 아니면 남길 창 수(저장 전이면 모든 창을 내린다) */
const hideCaption = (n: number, restorable: number | undefined): string => (restorable ? COPY.hideRestore(restorable) : n > 0 ? COPY.hideKeep(n) : COPY.hideAll)

/** 목록 한 줄: 이름, 포함한 창 수(다른 모니터 구성이면 주황 글자로), 단축키와 등록 상태. 누르면 연다 */
function WorkspaceRow({ view, onOpen, ref }: { view: WorkspaceView; onOpen(): void; ref: React.Ref<HTMLButtonElement> }): React.JSX.Element {
  const ws = view.workspace
  const n = enabledCount(ws)
  const caption = isHideWorkspace(ws.id) ? hideCaption(n, view.restorable) : COPY.windows(n)
  const otherConfig = !view.sameConfig && hasLayout(ws)
  const label = [
    `${ws.name} 열기`,
    caption,
    otherConfig ? COPY.otherConfig : null,
    ws.hotkey ? `단축키 ${ws.hotkey}${view.hotkeyRegistered ? '' : `, ${COPY.notRegistered}`}` : null
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onClick={onOpen}
      className="flex w-full items-center gap-4 border-b border-line px-4 py-2.5 text-left transition-colors duration-(--dur-hover) first:rounded-t-window last:rounded-b-window last:border-b-0 hover:bg-row-hover"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body leading-5 text-fg">{ws.name}</span>
        <span className="block truncate text-small leading-5 text-fg-2">
          {caption}
          {otherConfig ? <span className="text-warn"> · {COPY.otherConfig}</span> : null}
        </span>
      </span>
      {ws.hotkey ? (
        <span className="flex shrink-0 items-center gap-3">
          {view.hotkeyRegistered ? null : <span className="text-small whitespace-nowrap text-danger">{COPY.notRegistered}</span>}
          <kbd className="rounded-control border border-line bg-surface-inset px-2 py-0.5 font-ui text-small whitespace-nowrap text-fg">{ws.hotkey}</kbd>
        </span>
      ) : null}
      <ChevronRightIcon size={16} className="shrink-0 text-fg-3" />
    </button>
  )
}

/** 빈 화면 그림: 모니터 그림과 같은 말(한 단 들어간 화면, 점선은 아직 저장하지 않은 창) */
function EmptyArt(): React.JSX.Element {
  return (
    <svg width="136" height="56" viewBox="0 0 136 56" aria-hidden="true" className="block">
      {[
        { x: 1, y: 8, w: 64, h: 40 },
        { x: 71, y: 4, w: 64, h: 44 }
      ].map((m, i) => (
        <g key={i}>
          <rect x={m.x + 0.5} y={m.y + 0.5} width={m.w - 1} height={m.h - 1} rx={4} fill="var(--surface-inset)" stroke="var(--line)" />
          <rect x={m.x} y={m.y + m.h - 4} width={m.w} height={3.5} fill="var(--line)" />
        </g>
      ))}
      <rect x={6.5} y={13.5} width={27} height={26} fill="none" stroke="var(--text-3)" strokeDasharray="3 2" />
      <rect x={36.5} y={13.5} width={24} height={26} fill="none" stroke="var(--text-3)" strokeDasharray="3 2" />
      <rect x={77.5} y={9.5} width={52} height={33} fill="var(--brand)" fillOpacity={0.2} stroke="var(--brand)" />
      <rect x={77.5} y={9.5} width={52} height={3} fill="var(--brand)" fillOpacity={0.9} />
    </svg>
  )
}

type FieldErrors = Partial<Record<string, string[]>>
const keyOf = (f: DraftField): string => (f.kind === 'rule' ? `rule:${f.id}` : f.kind)

/**
 * 워크스페이스 하나. 칸을 저장할 때마다 그 칸만 적은 값으로 편집 값을 만들어(fieldEdit) 차례로 보낸다(앞 저장의 답을 받은 뒤에
 * 다음 편집 값을 만든다: 서로 덮지 않게, createFieldCommits). 다른 곳에서 바뀌면(item) 손대지 않은 칸만 새 값을 따른다(rebaseDraft).
 */
function WorkspaceDetail({
  item,
  canControl,
  focus,
  focusSeq,
  notice,
  onRefresh,
  onBack,
  onRemoved
}: {
  item: WorkspaceView
  canControl: boolean
  focus: Opened['focus']
  focusSeq: number
  notice: Notice | null
  onRefresh(): void
  onBack(): void
  onRemoved(name: string): void
}): React.JSX.Element {
  const { track } = useSettingsCtx()
  const api = window.sureMate
  /** 기본 워크스페이스 화면 감추기: 하는 일 안내·감추기 단추·항상 위 옵션, 지우기 없음 */
  const hide = isHideWorkspace(item.workspace.id)
  const [saved, setSaved] = useState(item.workspace)
  const [draft, setDraft] = useState<WorkspaceDraft>(() => draftFromWorkspace(item.workspace))
  const savedRef = useRef(saved)
  const draftRef = useRef(draft)
  const [errors, setErrors] = useState<FieldErrors>({})
  /** 불러오기·다시 저장 결과(처음에는 지금 배치 저장 결과) */
  const [actionNotice, setActionNotice] = useState<Notice | null>(notice)
  const [action, setAction] = useState<'restore' | 'recapture' | null>(null)
  const [active, setActive] = useState<string | null>(() => {
    const rules = firstLayout(item.workspace)?.windows ?? []
    return (rules.find((r) => r.enabled) ?? rules[0])?.id ?? null
  })
  const backRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const ids = useId()

  const putSaved = (ws: Workspace): void => {
    savedRef.current = ws
    setSaved(ws)
  }
  const putDraft = (update: (d: WorkspaceDraft) => WorkspaceDraft): void => {
    draftRef.current = update(draftRef.current)
    setDraft(draftRef.current)
  }
  const setError = (f: DraftField, list: string[] | null): void => setErrors((e) => ({ ...e, [keyOf(f)]: list && list.length ? list : undefined }))

  /**
   * 칸마다 그 자리 저장(차례로). 보낼 때의 칸 글을 기억해, 답이 오기 전에 그 칸을 또 바꿨으면 새 글을 남긴다(A-I2).
   * 처음 쓸 때(이벤트·effect에서) 만들어 계속 쓴다: 포트는 ref와 바뀌지 않는 setState만 쓴다
   */
  const commitsRef = useRef<FieldCommits | null>(null)
  const commits = (): FieldCommits =>
    (commitsRef.current ??= createFieldCommits({
      saved: () => savedRef.current,
      draft: () => draftRef.current,
      putSaved,
      putDraft,
      send: (id, edit) => track(() => api.editWorkspace(id, edit).catch((): WorkspaceEditResult => ({ ok: false, errors: [COPY.saveFailed] }))),
      setError
    }))

  // 다른 곳에서 바뀜(팔레트·바 저장, 단축키, 다시 저장, 이 화면 저장의 알림): 손대지 않은 칸만 새 값을 따른다
  useEffect(() => {
    commits().external(item.workspace)
  }, [item.workspace])

  // 처음 포커스: main이 열었으면(팔레트 Ctrl+Enter, 지금 배치 저장) 이름 칸을 통째로 골라 두고, 목록에서 열었으면 목록 단추
  useEffect(() => {
    if (focus === 'name') {
      nameRef.current?.focus()
      nameRef.current?.select()
    } else backRef.current?.focus()
  }, [focus, focusSeq])

  // 규칙이 바뀌면(다시 저장) 고른 줄을 새 규칙에서 다시 고른다
  const rules = firstLayout(saved)?.windows ?? []
  useEffect(() => {
    if (active && rules.some((r) => r.id === active)) return
    setActive((rules.find((r) => r.enabled) ?? rules[0])?.id ?? null)
  }, [rules, active])

  /** 그 칸을 그 자리에서 저장한다(차례로). 저장된 값과 같으면 보내지 않고 칸을 다듬은 값으로 맞춘다 */
  const commit = (field: DraftField): void => commits().commit(field)

  const setRule = (id: string, patch: Partial<WorkspaceDraft['rules'][number]>): void =>
    putDraft((d) => ({ ...d, rules: d.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))

  const restore = async (): Promise<void> => {
    setAction('restore')
    setActionNotice(null)
    // 칸을 떠나며 보낸 저장(포함 여부 등)이 끝난 뒤에 불러온다
    await commits().idle()
    const r = await api.runWorkspace(savedRef.current.id).catch((): WorkspaceRunResult => ({ ok: false, reason: 'invalid' }))
    setAction(null)
    setActionNotice(runNotice(savedRef.current.name, r))
    // 화면 감추기: 다음 누름이 되돌리기인지(단추 이름) 새 목록으로 받는다
    if (hide) onRefresh()
  }

  const recapture = async (): Promise<void> => {
    setAction('recapture')
    setActionNotice(null)
    await commits().idle()
    const r = await track(() =>
      api.recaptureWorkspace(savedRef.current.id).catch((): WorkspaceSaveResult => ({ ok: false, reason: 'save-failed', message: WORKSPACE_NOTES.saveFailed }))
    )
    setAction(null)
    setActionNotice(r.ok ? { tone: 'ok', text: COPY.recaptured(r) } : { tone: r.reason === 'busy' ? 'warn' : 'error', text: r.message })
    if (r.ok) onRefresh()
  }

  const layout = firstLayout(saved)
  const enabled = draft.rules.filter((r) => r.enabled).length
  const busy = action !== null
  /** 화면 감추기를 지금 누르면 되돌리기인지(단추 이름) */
  const restoring = hide && (item.restorable ?? 0) > 0
  const runLabel = hide ? (action === 'restore' ? (restoring ? COPY.unhiding : COPY.hiding) : restoring ? COPY.unhide : COPY.hideNow) : action === 'restore' ? COPY.restoring : COPY.restore
  // 그림은 칸의 글(포함 여부·대상 모니터)을 바로 따른다(저장 응답을 기다리지 않는다)
  const byId = new Map(draft.rules.map((r) => [r.id, r]))
  const shown: SavedLayout | null = layout && {
    ...layout,
    windows: layout.windows.map((w) => {
      const d = byId.get(w.id)
      return d ? { ...w, enabled: d.enabled, target: { ...w.target, monitor: d.monitor } } : w
    })
  }
  const checkboxId = (ruleId: string): string => `${ids}-include-${ruleId}`

  return (
    // 칸이 넓으면(600 이상) 왼쪽은 편집 칸, 오른쪽은 모니터 그림과 불러오기·다시 저장(내용을 내려도 위에 붙어 있다).
    // 좁으면 그림과 단추가 편집 칸 위로 간다(Tab 순서도 그림 쪽 단추가 먼저)
    <div className="@container flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            ref={backRef}
            type="button"
            aria-label={COPY.backLabel}
            onClick={onBack}
            className="flex h-8 shrink-0 items-center gap-1 rounded-control pr-2.5 pl-1.5 text-small text-fg-2 transition-colors duration-(--dur-hover) hover:bg-row-hover hover:text-fg"
          >
            <ChevronLeftIcon size={16} />
            {COPY.back}
          </button>
          <h3 className="min-w-0 flex-1 truncate text-body leading-5 font-semibold text-fg">{saved.name}</h3>
        </div>
        {hide ? (
          // 화면 감추기가 하는 일(문장마다 줄을 바꾼다)
          <p className="flex items-start gap-2 rounded-window border border-line bg-surface-inset px-3 py-2.5 text-small leading-5 break-keep text-fg-2">
            <EyeOffIcon size={16} className="mt-0.5 shrink-0 text-brand" />
            <span>
              {COPY.hideAbout.map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </span>
          </p>
        ) : null}
        {item.sameConfig || !hasLayout(saved) ? null : (
          <p className="flex items-start gap-2 rounded-window border border-warn/35 bg-warn/10 px-3 py-2.5 text-small leading-5 break-keep text-warn">
            <TriangleAlertIcon size={16} className="mt-0.5 shrink-0" />
            {COPY.otherConfigLine}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-5 gap-y-7 @min-[600px]:grid-cols-[minmax(0,1fr)_240px]">
        {/* 그림과 불러오기·다시 저장을 먼저 둔다(좁을 때 위에 보이는 순서와 Tab 순서가 같게). 넓으면 오른쪽 열로 */}
        <aside aria-label={COPY.inspector} className="@min-[600px]:col-start-2 @min-[600px]:row-start-1">
          <div className="flex flex-col gap-3 @min-[600px]:sticky @min-[600px]:top-4">
            {shown && shown.monitors.length > 0 ? (
              // 머리 글은 왼쪽 구역 머리와 같은 줄·같은 모양(그림 상자 위쪽이 왼쪽 상자 위쪽과 맞는다)
              <div className="flex flex-col gap-2">
                <h3 className="px-1 text-caption leading-4 font-semibold text-fg-2">{COPY.previewTitle}</h3>
                <div className="rounded-window bg-surface-inset">
                <MonitorPreview
                  layout={shown}
                  active={active}
                  summary={COPY.previewSummary(shown.monitors.length, shown.windows.length, enabled)}
                  onHover={setActive}
                  onPick={(ruleId) => document.getElementById(checkboxId(ruleId))?.focus()}
                />
                </div>
              </div>
            ) : null}
            {/* 하는 동안은 busy(aria-disabled): 누른 단추가 포커스를 잃지 않는다(A-M8) */}
            <div className="flex flex-wrap gap-2 @min-[600px]:flex-col">
              <Button kind="primary" disabled={!canControl} busy={busy} onClick={() => void restore()}>
                {runLabel}
              </Button>
              <Button disabled={!canControl} busy={busy} onClick={() => void recapture()}>
                {action === 'recapture' ? COPY.saving : COPY.recapture}
              </Button>
            </div>
            {/* 단추를 쓸 수 없으면 그 까닭을, 쓸 수 있으면 다시 저장이 무엇을 바꾸는지를 단추 바로 아래에 */}
            <p className={`text-small leading-5 break-keep ${canControl ? 'text-fg-2' : 'text-warn'}`}>
              {(canControl ? (hide ? COPY.hideRecaptureHelp : COPY.recaptureHelp) : COPY.blocked).map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </p>
            {actionNotice ? <NoticeLine notice={actionNotice} /> : null}
          </div>
        </aside>
        <div className="flex min-w-0 flex-col gap-7 @min-[600px]:col-start-1 @min-[600px]:row-start-1">
          <Section title={COPY.identity}>
            <FieldRow label={COPY.name} description={COPY.nameDesc} errors={errors.name}>
              {(f) => (
                <TextField
                  ref={nameRef}
                  {...f}
                  value={draft.name}
                  maxLength={WORKSPACE_LIMITS.name}
                  onChange={(name) => putDraft((d) => ({ ...d, name }))}
                  onCommit={() => commit({ kind: 'name' })}
                  width="w-full"
                />
              )}
            </FieldRow>
            <FieldRow label={COPY.aliases} description={COPY.aliasesDesc} errors={errors.aliases}>
              {(f) => (
                <TextField
                  {...f}
                  value={draft.aliases}
                  placeholder={COPY.aliasesPlaceholder}
                  onChange={(aliases) => putDraft((d) => ({ ...d, aliases }))}
                  onCommit={() => commit({ kind: 'aliases' })}
                  width="w-full"
                />
              )}
            </FieldRow>
            <HotkeyRow workspace={saved} registered={item.hotkeyRegistered} description={hide ? COPY.hideHotkeyDesc : undefined} onChanged={onRefresh} />
          </Section>

          {hide ? (
            <Section title={COPY.keepOnTopSection}>
              <KeepOnTopRow workspace={item.workspace} />
            </Section>
          ) : null}

          <Section title={COPY.layout}>
            {/* 화면 감추기는 저장 전에도 쓸 수 있어(모든 창을 내린다) 주의 색 없이 하는 일을 적는다 */}
            {hide && !layout ? null : (
              <p className={`border-b border-line px-4 py-3 text-small leading-5 break-keep ${enabled > 0 || !layout || hide ? 'text-fg-2' : 'text-warn'}`}>
                {hide ? COPY.hideLayoutHelp(enabled) : COPY.layoutHelp(enabled)}
              </p>
            )}
            {layout && layout.windows.length > 0 ? (
              <RuleList
                layout={layout}
                draft={draft}
                active={active}
                errors={errors}
                checkboxId={checkboxId}
                onActive={setActive}
                onToggle={(id, on) => {
                  setRule(id, { enabled: on })
                  commit({ kind: 'rule', id, prop: 'enabled' })
                }}
                onTitle={(id, titleIncludes) => setRule(id, { titleIncludes })}
                onTitleCommit={(id) => commit({ kind: 'rule', id, prop: 'titleIncludes' })}
                onMonitor={(id, monitor) => {
                  setRule(id, { monitor })
                  commit({ kind: 'rule', id, prop: 'monitor' })
                }}
              />
            ) : (
              <p className="px-4 py-3 text-small leading-5 break-keep text-fg-2">{hide ? COPY.hideNoRules : COPY.noRules}</p>
            )}
          </Section>

          {/* 기본 워크스페이스(화면 감추기)는 지울 수 없다(main도 거절한다) */}
          {hide ? null : (
          <Section title={COPY.removeSection}>
            <Row label={COPY.removeLabel} description={COPY.removeDesc} stack>
              {(f) => (
                <RemoveButton
                  describedBy={f.descId}
                  onRemove={async () => {
                    await commits().idle()
                    const ok = await api.removeWorkspace(savedRef.current.id).catch(() => false)
                    if (ok) onRemoved(savedRef.current.name)
                    return ok
                  }}
                />
              )}
            </Row>
          </Section>
          )}
        </div>

      </div>
    </div>
  )
}

/** 불러오기 결과를 그 자리에 보이는 문구로(알림도 함께 뜬다). 화면 감추기는 내린·되돌린 창 수 */
function runNotice(name: string, r: WorkspaceRunResult): Notice {
  if (r.ok && r.hide) {
    const missed = r.hide.kind === 'hide' ? r.hide.elevated + r.hide.skipped : r.hide.skipped
    return { tone: missed > 0 || r.report.placed < r.report.total ? 'warn' : 'ok', text: hideSummary(name, r.report, r.hide) }
  }
  if (r.ok) return { tone: r.report.placed < r.report.total ? 'warn' : 'ok', text: restoreSummary(name, r.report) }
  switch (r.reason) {
    case 'cancelled':
      return { tone: 'ok', text: COPY.cancelled }
    case 'empty':
      return { tone: 'warn', text: COPY.empty }
    case 'busy':
      return { tone: 'warn', text: WORKSPACE_NOTES.busy }
    case 'native-unavailable':
      return { tone: 'error', text: WORKSPACE_NOTES.nativeUnavailable }
    case 'missing':
      return { tone: 'error', text: WORKSPACE_NOTES.missing }
    case 'save-failed':
      return { tone: 'error', text: WORKSPACE_NOTES.saveFailed }
    default:
      return { tone: 'error', text: COPY.runFailed }
  }
}

/**
 * 감춘 동안 업무 창을 항상 위에 두기(화면 감추기의 옵션, 기본 꺼짐, 2026-11-12). 스위치는 누르면 바로 바뀌고 저장하며, 저장하지 못하면
 * 되돌리고 까닭을 적는다. 다른 곳에서 바뀌면(목록 알림) 그 값을 따른다
 */
function KeepOnTopRow({ workspace }: { workspace: Workspace }): React.JSX.Element {
  const saved = workspace.keepOnTop === true
  const [pending, setPending] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  const checked = pending ?? saved
  return (
    <Row label={COPY.keepOnTop} description={COPY.keepOnTopDesc}>
      {(f) => (
        <div className="flex flex-col items-end gap-1.5">
          <Toggle
            {...f}
            checked={checked}
            onChange={(on) => {
              setPending(on)
              setFailed(false)
              void window.sureMate
                .setWorkspaceKeepOnTop(workspace.id, on)
                .catch(() => false)
                .then((ok) => {
                  setPending(null)
                  if (!ok) setFailed(true)
                })
            }}
          />
          {failed ? <NoticeLine notice={{ tone: 'error', text: COPY.keepOnTopFailed }} /> : null}
        </div>
      )}
    </Row>
  )
}

/** 이름·설명 아래에 입력칸(편집 칸은 좁은 왼쪽 열이라 위아래로 쌓는다). 저장 오류는 입력칸 바로 아래에 보인다 */
function FieldRow({
  label,
  description,
  errors,
  children
}: {
  label: string
  description: string
  errors?: string[]
  children: (f: { labelId: string; describedBy: string; invalid: boolean }) => ReactNode
}): React.JSX.Element {
  const id = useId()
  const errorId = `${id}-error`
  const failed = Boolean(errors?.length)
  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0">
      <div>
        <div id={`${id}-label`} className="text-body leading-5 text-fg">
          {label}
        </div>
        <div id={`${id}-desc`} className="mt-0.5 text-small leading-5 text-balance break-keep text-fg-2">
          {description}
        </div>
      </div>
      {children({ labelId: `${id}-label`, describedBy: failed ? `${id}-desc ${errorId}` : `${id}-desc`, invalid: failed })}
      {failed ? (
        <p id={errorId} role="alert" className="text-small leading-5 break-keep text-danger">
          {errors?.join(' · ')}
        </p>
      ) : null}
    </div>
  )
}

/**
 * 워크스페이스 단축키(설계 §11): 지금 조합(없으면 '없음')·등록 상태, 정하기·바꾸기(단축키 탭과 같은 녹화 칸, id workspace:<id>),
 * 지우기. 녹화 칸이나 지우기 단추가 사라져 포커스를 잃으면 정하기·바꾸기 단추로 돌려준다(키보드만으로 사용, §16).
 */
function HotkeyRow({
  workspace,
  registered,
  description = COPY.hotkeyDesc,
  onChanged
}: {
  workspace: Workspace
  registered: boolean
  /** 단축키가 하는 일(화면 감추기는 감추기·되돌리기) */
  description?: string
  onChanged(): void
}): React.JSX.Element {
  const api = window.sureMate.settings
  const hotkeyId = `workspace:${workspace.id}` as const
  const acc = workspace.hotkey
  const id = useId()
  const labelId = `${id}-label`
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const changeRef = useRef<HTMLButtonElement>(null)
  const clearing = useRef(false)

  const wasRecording = useRef(false)
  useEffect(() => {
    if (wasRecording.current && !recording) {
      const activeEl = document.activeElement
      if (!activeEl || activeEl === document.body) changeRef.current?.focus()
    }
    wasRecording.current = recording
  }, [recording])

  const clear = async (): Promise<void> => {
    if (clearing.current) return
    clearing.current = true
    changeRef.current?.focus()
    setNotice(null)
    try {
      const r = await api.hotkeySet(hotkeyId, null)
      setNotice(r.ok ? { text: COPY.hotkeyCleared, tone: 'ok' } : { text: r.reason, tone: 'error' })
    } catch {
      setNotice({ text: COPY.hotkeyClearFailed, tone: 'error' })
    } finally {
      clearing.current = false
      onChanged()
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-48 flex-1">
          <div id={labelId} className="text-body leading-5 text-fg">
            {COPY.hotkey}
          </div>
          <div className="mt-0.5 text-small leading-5 text-balance break-keep text-fg-2">{description}</div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <kbd className={`rounded-control border border-line bg-surface-inset px-2 py-1 font-ui text-small whitespace-nowrap ${acc ? 'text-fg' : 'text-fg-3'}`}>{acc ?? COPY.none}</kbd>
          {acc ? <span className={`text-small whitespace-nowrap ${registered ? 'text-fg-2' : 'text-danger'}`}>{registered ? COPY.inUse : COPY.notRegistered}</span> : null}
          {recording ? null : (
            <div className="flex gap-2">
              <Button
                ref={changeRef}
                label={acc ? `단축키 바꾸기, 지금 ${acc}${registered ? '' : `, ${COPY.notRegistered}`}` : `단축키 정하기, 지금 ${COPY.none}`}
                onClick={() => {
                  setNotice(null)
                  setRecording(true)
                }}
              >
                {acc ? '바꾸기' : '정하기'}
              </Button>
              {acc ? (
                <Button label="단축키 지우기" onClick={() => void clear()}>
                  지우기
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {recording ? (
        <HotkeyRecorder
          id={hotkeyId}
          labelledBy={labelId}
          onDone={(r) => {
            setRecording(false)
            if (r) setNotice(r.warning ? { text: `${COPY.hotkeyDone(r.acc)} · ${r.warning}`, tone: 'warn' } : { text: COPY.hotkeyDone(r.acc), tone: 'ok' })
            onChanged()
          }}
        />
      ) : null}
      {notice ? <NoticeLine notice={notice} /> : null}
      {acc && !registered && !recording ? <p className="text-small leading-5 break-keep text-danger">{COPY.hotkeyTaken}</p> : null}
    </div>
  )
}

/**
 * 창 규칙 목록(설계 §11 "저장된 창 목록(포함 여부, 실행 파일, 제목 규칙, 대상 모니터)"): 줄마다 포함 체크 상자 · 프로그램 이름과
 * 저장할 때 제목 · 최대화 표시, 포함한 창은 그 아래에 '제목에 포함' 입력칸과 대상 모니터 단추. 고른 줄(마우스를 올리거나
 * 포커스가 있는 줄)은 바탕을 밝히고 모니터 그림에서 그 창을 강조한다. 포함하지 않은 창은 한 줄로 접는다.
 */
function RuleList({
  layout,
  draft,
  active,
  errors,
  checkboxId,
  onActive,
  onToggle,
  onTitle,
  onTitleCommit,
  onMonitor
}: {
  layout: SavedLayout
  draft: WorkspaceDraft
  active: string | null
  errors: FieldErrors
  checkboxId(ruleId: string): string
  onActive(id: string): void
  onToggle(id: string, on: boolean): void
  onTitle(id: string, text: string): void
  onTitleCommit(id: string): void
  onMonitor(id: string, monitor: string): void
}): React.JSX.Element {
  const ids = useId()
  const byId = new Map(draft.rules.map((r) => [r.id, r]))
  return (
    <div className="flex flex-col">
      {layout.windows.map((rule) => {
        const d = byId.get(rule.id)
        if (!d) return null
        const { app, title } = ruleCaption(rule)
        const on = rule.id === active
        const err = errors[`rule:${rule.id}`]
        const monitor = layout.monitors.find((m) => m.key === d.monitor)
        const monitorName = monitor ? monitorLabel(monitor, layout.monitors) : '?'
        return (
          <div
            key={rule.id}
            data-rule={rule.id}
            onMouseEnter={() => onActive(rule.id)}
            onFocus={() => onActive(rule.id)}
            className={`grid grid-cols-[16px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 last:rounded-b-window last:border-b-0 ${on ? 'bg-row-selected' : ''}`}
          >
            <Checkbox id={checkboxId(rule.id)} checked={d.enabled} label={COPY.include(app, title)} onChange={(v) => onToggle(rule.id, v)} />
            {/* 창 이름을 눌러도 체크 상자가 바뀐다(16 체크 상자보다 넓은 누를 곳) */}
            <label htmlFor={checkboxId(rule.id)} className="flex min-h-5 min-w-0 cursor-pointer items-center gap-2">
              <span className={`max-w-[65%] shrink-0 truncate text-body leading-5 ${d.enabled ? 'text-fg' : 'text-fg-2'}`}>{app}</span>
              {title ? <span className="min-w-0 truncate text-small leading-5 text-fg-2">{title}</span> : null}
              {rule.target.state === 'maximized' ? (
                <span className="ml-auto shrink-0 rounded-full border border-line px-1.5 text-caption leading-4 text-fg-2">{COPY.maximized}</span>
              ) : null}
            </label>
            {d.enabled ? (
              <div className="col-start-2 flex min-w-0 items-center gap-2">
                <TitleField
                  value={d.titleIncludes}
                  label={COPY.titleLabel(app)}
                  invalid={Boolean(err?.length)}
                  describedBy={err?.length ? `${ids}-error-${rule.id}` : undefined}
                  onChange={(v) => onTitle(rule.id, v)}
                  onCommit={() => onTitleCommit(rule.id)}
                />
                {layout.monitors.length > 1 ? (
                  <button
                    type="button"
                    aria-label={COPY.monitorButton(monitorName)}
                    onClick={() => onMonitor(rule.id, nextMonitor(d.monitor, layout.monitors))}
                    className="flex h-8 w-22 shrink-0 items-center gap-1.5 rounded-control border border-line px-2 text-small text-fg transition-colors duration-(--dur-hover) hover:bg-row-hover"
                  >
                    <MonitorIcon size={14} className="shrink-0 text-fg-2" />
                    <span className="truncate">{monitorName}</span>
                  </button>
                ) : (
                  <span className="flex h-8 w-22 shrink-0 items-center gap-1.5 px-2 text-small text-fg-2">
                    <MonitorIcon size={14} className="shrink-0" />
                    <span className="truncate">{monitorName}</span>
                  </span>
                )}
              </div>
            ) : null}
            {err?.length ? (
              <p id={`${ids}-error-${rule.id}`} role="alert" className="col-start-2 text-small leading-5 break-keep text-danger">
                {err.join(' · ')}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** 포함 체크 상자. 켜면 청록 바탕에 진한 체크(--ink), 끄면 테두리만. Space로 바꾼다(기본 동작) */
function Checkbox({ id, checked, label, onChange }: { id: string; checked: boolean; label: string; onChange(v: boolean): void }): React.JSX.Element {
  return (
    <span className="relative mt-0.5 flex size-4 shrink-0">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        className="peer size-4 cursor-pointer appearance-none rounded-control border-[1.5px] border-fg-3 transition-colors duration-(--dur-hover) checked:border-brand checked:bg-brand hover:border-fg-2 checked:hover:border-brand"
      />
      <svg viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none absolute inset-0 hidden size-4 peer-checked:block">
        <path d="M4 8.5 7 11.25 12 5" fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/** '제목에 포함' 입력칸: 칸 안 앞쪽에 이름표. 한글 조합 중 Enter는 무시하고, 조합이 아닌 Enter 또는 칸을 떠날 때 저장 */
function TitleField({
  value,
  label,
  invalid,
  describedBy,
  onChange,
  onCommit
}: {
  value: string
  label: string
  invalid: boolean
  describedBy?: string
  onChange(v: string): void
  onCommit(): void
}): React.JSX.Element {
  return (
    <label
      className={`flex h-8 min-w-0 flex-1 cursor-text items-center gap-2 rounded-control border bg-surface-inset pr-2 pl-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${invalid ? 'border-danger' : 'border-line'}`}
    >
      <span aria-hidden="true" className="shrink-0 text-caption text-fg-3">
        {COPY.titlePrefix}
      </span>
      <input
        type="text"
        value={value}
        maxLength={WORKSPACE_LIMITS.titleIncludes}
        placeholder={COPY.titlePlaceholder}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (isImeComposing(e.nativeEvent)) return
          if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            e.preventDefault()
            onCommit()
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
      />
    </label>
  )
}

/** 지우기: 한 번 누르면 '한 번 더 누르면 지워요'로 바뀌고, 두 번째에 지운다. 포커스가 단추를 떠나면 되돌린다(ConfirmButton) */
function RemoveButton({ onRemove, describedBy }: { onRemove(): Promise<boolean>; describedBy?: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  return (
    <div className="flex flex-col items-start gap-1.5">
      <ConfirmButton
        armed={COPY.removeArmed}
        describedBy={describedBy}
        onArm={() => setFailed(false)}
        onConfirm={async () => {
          if (!(await onRemove())) setFailed(true)
        }}
      >
        {COPY.remove}
      </ConfirmButton>
      {failed ? <NoticeLine notice={{ tone: 'error', text: COPY.removeFailed }} /> : null}
    </div>
  )
}
