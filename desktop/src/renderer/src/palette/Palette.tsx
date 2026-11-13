import { Command } from 'cmdk'
import { useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createExecutionGuard } from '../../../shared/execution-guard'
import { isImeComposing } from '../../../shared/ime'
import type { PromptDraft } from '../../../shared/ipc-channels'
import { parseQuery, shownView } from '../../../shared/palette-query'
import type { PaletteItem } from '../../../shared/types'
import { WORKSPACE_EDIT_PREFIX, WORKSPACE_ITEM_PREFIX } from '../../../shared/workspace/workspace-ipc'
import { GroupIcon, LightbulbIcon, SearchIcon } from '../design/icons'
import { Confirm } from './Confirm'
import { isRepeatedEnter } from './confirm-state'
import { DevOutput } from './DevOutput'
import {
  buildPaletteIndex,
  EMPTY_SEARCH_CONTEXT,
  groupItems,
  searchContextOf,
  searchPalette,
  SECTION_LABELS,
  WIKI_ADD_ID,
  withWikiAdd,
  WORKSPACE_SAVE_AS_ID,
  withWorkspaceSaveAs,
  type PaletteSearch,
  type SearchContext
} from './filter-items'
import { laggingEnterAction, listKeyAction } from './list-keys'
import { rememberHint, tipFor } from './palette-hints'
import { selectionUpdater } from './selection'
import { StatusBar } from './StatusBar'
import { WikiDetail } from './WikiDetail'
import { WikiEdit } from './WikiEdit'
import { NO_WIKI_VIEW, wikiViewReducer } from './wiki-state'

/** 같은 항목을 300ms 안에 두 번 실행하지 않는다(한글 조합 중 Enter 중복 대비) */
const runGuard = createExecutionGuard(300)

const PREFIX_HINTS = [
  ['/', '프롬프트'],
  ['?', '위키'],
  ['>', '명령']
] as const

/** 워크스페이스 행의 보조 동작(Ctrl+Enter·@에서 →): 설정 창 워크스페이스 탭에서 그 워크스페이스를 연다(workspace-edit:<id>) */
const workspaceEditId = (itemId: string): string => `${WORKSPACE_EDIT_PREFIX}${itemId.slice(WORKSPACE_ITEM_PREFIX.length)}`

/** 그릴 목록: 검색 결과 끝에 '직접 추가하기'(위키)와 '이름으로 저장'(@) 줄을 붙인다 */
const rowsOf = (s: PaletteSearch, query: string): PaletteItem[] => withWorkspaceSaveAs(withWikiAdd(s.items, query), query)

/** 행 오른쪽 덧붙임의 높이·모서리(의도 표시와 키 모양이 같은 줄에 맞게) */
const ACCESSORY = 'inline-flex h-5 shrink-0 items-center rounded-control border px-1.5 text-caption'

/** 맨 위 후보의 의도 표시(설계 §6). 움직이지 않고, 색과 함께 글자로 알린다 */
function IntentChip({ label }: { label: string }): React.JSX.Element {
  return (
    <span className={`ml-auto ${ACCESSORY} border-brand/45 text-brand`}>
      <span className="sr-only">의도: </span>
      {label}
    </span>
  )
}

/** 맨 위가 아닌 고른 행: Shift+Enter로 친 문장을 이 항목에 기억시키며 실행한다(설계 §13 8단계) */
function RememberHint(): React.JSX.Element {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 text-caption text-fg-2">
      <kbd className={`${ACCESSORY} border-line font-ui text-fg-2`}>Shift</kbd>
      <kbd className={`${ACCESSORY} border-line font-ui text-fg-2`}>Enter</kbd>
      <span className="ml-1">기억하고 실행</span>
    </span>
  )
}

/** 빈 화면의 사용 팁 한 줄(설계 §6). 목록 행과 같은 줄에 맞춰 상태 표시줄(아래 구분선)과 나눈다 */
function TipLine({ text, className = '' }: { text: string; className?: string }): React.JSX.Element {
  return (
    <p className={`flex items-center gap-3 text-caption text-fg-2 ${className}`}>
      <LightbulbIcon size={16} className="shrink-0 text-fg-3" />
      <span className="min-w-0 truncate">{text}</span>
    </p>
  )
}

export function Palette(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [allItems, setAllItems] = useState<PaletteItem[]>([])
  // 말하듯 입력 단어 목록·기억한 문장·사용 기록(설계 §13·§9 동점 순서). 항목과 함께 받는다
  const [ctx, setCtx] = useState<SearchContext>(EMPTY_SEARCH_CONTEXT)
  const [dev, setDev] = useState<{ title: string; text: string } | null>(null)
  const [confirm, setConfirm] = useState<PromptDraft | null>(null)
  // 용어 상세와 그 위의 추가·수정 화면. 저장하지 않은 추가·수정 글은 팔레트가 숨었다 다시 보여도 남는다
  const [wikiView, dispatchWiki] = useReducer(wikiViewReducer, NO_WIKI_VIEW)
  const wiki = wikiView.detail
  const wikiEdit = wikiView.edit
  const [shownCount, setShownCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // 입력값은 그대로 두고, 목록만 지연 값으로 그린다(조합 중 입력이 끊기지 않게)
  const deferredQuery = useDeferredValue(query)
  // 검색 키(초성·자모·자판)는 항목이 바뀔 때만 다시 계산한다
  const index = useMemo(() => buildPaletteIndex(allItems), [allItems])
  const search = useMemo(() => searchPalette(allItems, deferredQuery, index, ctx), [allItems, deferredQuery, index, ctx])
  const items = useMemo(() => rowsOf(search, deferredQuery), [search, deferredQuery])
  const [selected, setSelected] = useState('')
  const lastQuery = useRef('')
  // 팔레트를 보일 때마다 늘린다. 늦게 온 용어 상세 응답이 그 뒤에 다시 보인 팔레트를 바꾸지 않게
  const shownSeq = useRef(0)
  // 위키 카드가 연 용어 상세를 받는 중(그동안 빈 검색어 목록이 잠깐 비치지 않게 빈 바탕만 그린다)
  const [wikiLoading, setWikiLoading] = useState(false)

  // 선택은 직접 관리한다(cmdk 자동 선택은 지연 렌더링된 목록과 어긋남). 지난 검색어는 갱신 함수를 만들 때 붙잡는다(selectionUpdater)
  useEffect(() => {
    const update = selectionUpdater({ prevQuery: lastQuery.current, query: deferredQuery, items })
    lastQuery.current = deferredQuery
    setSelected(update)
  }, [deferredQuery, items])

  /** 항목과 검색 문맥을 함께 받아 한 번에 바꾼다(문맥을 받지 못하면 말하듯 입력 없이 M4 검색) */
  const refresh = (): void => {
    void Promise.all([window.sureMate.listItems(), window.sureMate.getSearchContext().catch(() => null)]).then(([list, payload]) => {
      setAllItems(list)
      setCtx(payload ? searchContextOf(payload) : EMPTY_SEARCH_CONTEXT)
    })
  }

  useEffect(refresh, [])

  useEffect(
    () =>
      window.sureMate.onShown((payload) => {
        const view = shownView(payload)
        const seq = ++shownSeq.current
        // main이 준 검색어로 시작한다(바의 용어 사전 단추는 '?')
        setQuery(view.query)
        setSelected('')
        refresh()
        setShownCount((n) => n + 1)
        setDev(payload.mode === 'dev-output' ? { title: payload.title, text: payload.text } : null)
        setConfirm(payload.mode === 'confirm' ? payload.draft : null)
        // 고치던 용어가 있으면 그 화면으로 돌아가고(커서는 WikiEdit가 마지막 칸에 둔다), 아니면 목록으로
        dispatchWiki({ type: 'shown' })
        // 위키 카드의 [팔레트에서 열기]: 그 용어 상세를 연다. 고치던 글이 있으면 그 글은 위에 두고 상세만 그 아래에.
        // 그사이 지워졌거나 받지 못하면 빈 검색어 목록 대신 위키 목록('?')을 보여 준다
        setWikiLoading(Boolean(view.wikiId))
        if (view.wikiId) {
          void window.sureMate
            .getWikiEntry(view.wikiId)
            .catch(() => null)
            .then((entry) => {
              if (seq !== shownSeq.current) return
              setWikiLoading(false)
              if (entry) {
                dispatchWiki({ type: 'show-entry', entry })
                return
              }
              setQuery('?')
              requestAnimationFrame(() => inputRef.current?.focus())
            })
        }
        requestAnimationFrame(() => inputRef.current?.focus())
      }),
    []
  )

  const close = (): void => {
    inputRef.current?.blur()
    window.sureMate.hide()
  }

  /**
   * 항목 실행. 목록 끝에 붙인 줄이 아니면 실행 전에 고른 항목을 main에 알린다(사용 기록, 위키 행 포함).
   * remember이면 친 문장도 함께 보내 이 항목에 기억시킨다(문장은 로그에 남지 않는다, 설계 §13 8단계).
   */
  const run = (id: string, o: { remember: boolean } = { remember: false }): void => {
    if (!runGuard(id)) return
    if (id !== WIKI_ADD_ID && id !== WORKSPACE_SAVE_AS_ID) {
      window.sureMate.recordPick({ id, remember: o.remember, query: o.remember ? query : undefined })
    }
    if (id === WIKI_ADD_ID) {
      dispatchWiki({ type: 'add', term: parseQuery(query).text })
      return
    }
    // `@이름` 줄: 친 이름으로 지금 배치를 저장한다(runItem으로 보내지 않아 이름이 palette.run 로그에 남지 않는다).
    // 성공하면 main이 키를 뗀 것을 확인하고 팔레트를 숨긴다. 숨기지 못했으면(키를 누르고 있음) 새 목록으로 줄을 고친다
    if (id === WORKSPACE_SAVE_AS_ID) {
      void window.sureMate.saveWorkspaceAs(parseQuery(query).text).then((r) => {
        if (r.ok) refresh()
      })
      return
    }
    // 용어는 팔레트 안에서 상세를 연다(검색어는 그대로 두어 Esc로 돌아오면 같은 목록)
    if (id.startsWith('wiki:')) {
      void window.sureMate.getWikiEntry(id.slice('wiki:'.length)).then((entry) => {
        if (entry) dispatchWiki({ type: 'open', entry })
      })
      return
    }
    void window.sureMate.runItem(id)
  }

  /** 저장한 워크스페이스 행의 보조 동작: 설정 창 워크스페이스 탭에서 그 워크스페이스를 연다(같은 항목은 300ms 안에 두 번 열지 않는다) */
  const openWorkspaceEdit = (itemId: string): void => {
    const editId = workspaceEditId(itemId)
    if (runGuard(editId)) void window.sureMate.runItem(editId)
  }

  // 개발 출력과 확인 화면은 위키 추가·수정 화면보다 위에 그린다(그 아래 저장하지 않은 글은 그대로 남는다)
  if (dev) return <DevOutput title={dev.title} text={dev.text} onClose={close} />
  if (confirm) {
    return (
      <Confirm
        key={`${confirm.templateId}-${shownCount}`}
        draft={confirm}
        onBack={() => {
          setConfirm(null)
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
        onDone={() => setConfirm(null)}
      />
    )
  }
  if (wikiEdit) {
    return (
      <WikiEdit
        entry={wikiEdit.entry}
        form={wikiEdit.form}
        onForm={(form) => dispatchWiki({ type: 'form', form })}
        refocusKey={shownCount}
        onCancel={() => {
          dispatchWiki({ type: 'cancel-edit' })
          if (!wiki) requestAnimationFrame(() => inputRef.current?.focus())
        }}
        onSaved={(entry) => {
          dispatchWiki({ type: 'saved', entry })
          // 목록과 검색 색인에 새 용어가 들어가게
          refresh()
        }}
      />
    )
  }
  // 용어 상세를 받는 몇 ms 동안은 빈 바탕만(빈 검색어의 전체 목록이 한 번 비쳤다가 상세로 바뀌지 않게)
  if (wikiLoading) return <div className="h-screen bg-surface-palette" />
  if (wiki) {
    return (
      <WikiDetail
        key={wiki.id}
        entry={wiki}
        onEdit={() => dispatchWiki({ type: 'edit' })}
        onBack={() => {
          dispatchWiki({ type: 'back' })
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
      />
    )
  }

  // 빈 화면(설계 §6): 최근 실행 항목 다음에 사용 팁 한 줄. 첫 표시(shownCount 1)에 첫 팁
  const emptyQuery = deferredQuery.trim() === ''
  const tip = tipFor(shownCount - 1)
  const showRemember = rememberHint(search, selected)

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-surface-palette font-ui text-fg"
      onKeyDown={(e) => {
        if (isImeComposing(e.nativeEvent)) return
        if (e.code === 'Escape' || e.key === 'Escape') {
          e.preventDefault()
          close()
        }
      }}
    >
      <Command
        value={selected}
        onValueChange={setSelected}
        shouldFilter={false}
        loop
        label="Sure-Mate"
        className="flex min-h-0 flex-1 flex-col"
        onKeyDown={(e) => {
          // 누르고 있어 자동 반복된 Enter로 같은 항목을 또 고르지 않는다(cmdk는 preventDefault면 건너뛴다)
          if (isRepeatedEnter(e)) {
            e.preventDefault()
            return
          }
          const lagging = query !== deferredQuery
          const input = inputRef.current
          const caretAtEnd = !input || (input.selectionStart === input.value.length && input.selectionEnd === input.value.length)
          const key = { code: e.code, key: e.key, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, isComposing: isImeComposing(e.nativeEvent), repeat: e.repeat, caretAtEnd }
          // →로 편집을 여는 것은 지금 친 검색어가 @ 범위일 때만
          const workspaceScope = parseQuery(query).scope === 'workspace'
          // 목록이 검색어를 아직 못 따라왔으면 Enter는 고른 행(지난 검색어의 것) 대신 지금 검색어로 다시 만든 맨 위 줄에 같은 보조키로
          // 판단한다(직접 추가하기·이름으로 저장 줄 포함). 보조키를 누른 Enter인데 그 줄에 맞는 동작이 없으면 실행하지 않는다
          // (맨 위가 워크스페이스로 바뀐 뒤의 Ctrl+Enter가 편집 대신 불러오기로 창을 옮기지 않게)
          if (lagging) {
            const lag = laggingEnterAction(key, () => rowsOf(searchPalette(allItems, query, index, ctx), query)[0] ?? null, { workspaceScope })
            if (lag) {
              e.preventDefault()
              if (lag.type === 'run') run(lag.id)
              else if (lag.type === 'secondary') openWorkspaceEdit(lag.id)
              return
            }
          }
          const item = items.find((i) => i.id === selected) ?? null
          // 목록이 검색어를 못 따라온 동안의 기억하기 안내는 지난 검색어의 것이라 기억하지 않는다
          const action = listKeyAction(key, item, { remember: !lagging && showRemember, workspaceScope })
          if (action === 'remember') {
            e.preventDefault()
            run(selected, { remember: true })
            return
          }
          if (action === 'secondary' && item) {
            e.preventDefault()
            openWorkspaceEdit(item.id)
          }
        }}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
          <SearchIcon size={18} className="shrink-0 text-fg-3" />
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            autoFocus
            spellCheck={false}
            placeholder="무엇을 할까요?"
            className="h-full min-w-0 flex-1 bg-transparent text-input text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
          />
          <div className="flex shrink-0 items-center gap-2.5 text-caption text-fg-3">
            {PREFIX_HINTS.map(([key, label]) => (
              <span key={key} className="flex items-center gap-1">
                <kbd className="rounded-control border border-line px-1.5 font-ui text-fg-2">{key}</kbd>
                {label}
              </span>
            ))}
          </div>
        </div>
        <Command.List className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <Command.Empty className="px-3 py-10 text-center text-small text-fg-3">
            {emptyQuery ? <TipLine text={tip} className="justify-center" /> : '찾는 항목이 없어요. / ? > 로 범위를 좁혀 보세요.'}
          </Command.Empty>
          {/* 구역 순서는 점수 순: 맨 위 후보가 든 구역이 맨 위. 빈 화면은 최근 실행 항목이 맨 위 */}
          {groupItems(items, search.recent).map(({ section, items: sectionItems }) => (
            <Command.Group key={section} heading={SECTION_LABELS[section]}>
              {sectionItems.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.id}
                  onSelect={() => run(item.id)}
                  className="group relative flex h-10 cursor-default items-center gap-3 rounded-control px-3 text-body data-[selected=true]:bg-row-selected"
                >
                  <span className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-full bg-brand opacity-0 group-data-[selected=true]:opacity-100" />
                  <GroupIcon group={item.group} className="shrink-0 text-fg-3 group-data-[selected=true]:text-brand" />
                  {/* 오른쪽 덧붙임이 자리를 차지하면 부제가 먼저 줄고, 그다음 제목이 말줄임으로 준다 */}
                  <span className="min-w-0 truncate text-fg">{item.title}</span>
                  {/* 고른 행 바탕 위의 --text-3은 4.5:1이 안 되므로(4.1:1) 고른 행의 부제는 --text-2 */}
                  {item.subtitle && (
                    <span className="min-w-0 flex-1 basis-0 truncate text-small text-fg-3 group-data-[selected=true]:text-fg-2">{item.subtitle}</span>
                  )}
                  {search.top?.id === item.id && <IntentChip label={search.top.label} />}
                  {showRemember && selected === item.id && <RememberHint />}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
      {emptyQuery && items.length > 0 && <TipLine text={tip} className="h-8 shrink-0 border-t border-line px-5" />}
      <StatusBar refreshKey={shownCount} />
    </div>
  )
}
