import { Command } from 'cmdk'
import { useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createExecutionGuard } from '../../../shared/execution-guard'
import { isImeComposing } from '../../../shared/ime'
import type { PromptDraft } from '../../../shared/ipc-channels'
import { PALETTE_GROUPS, parseQuery, shownView } from '../../../shared/palette-query'
import type { PaletteGroup, PaletteItem } from '../../../shared/types'
import { GroupIcon, SearchIcon } from '../design/icons'
import { Confirm } from './Confirm'
import { isRepeatedEnter } from './confirm-state'
import { DevOutput } from './DevOutput'
import { buildPaletteIndex, filterItems, groupItems, WIKI_ADD_ID, withWikiAdd } from './filter-items'
import { nextSelection } from './selection'
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

const GROUP_LABELS = Object.fromEntries(PALETTE_GROUPS.map((g) => [g.id, g.label])) as Record<PaletteGroup, string>

export function Palette(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [allItems, setAllItems] = useState<PaletteItem[]>([])
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
  const items = useMemo(() => withWikiAdd(filterItems(allItems, deferredQuery, index), deferredQuery), [allItems, deferredQuery, index])
  const [selected, setSelected] = useState('')
  const lastQuery = useRef('')
  // 팔레트를 보일 때마다 늘린다. 늦게 온 용어 상세 응답이 그 뒤에 다시 보인 팔레트를 바꾸지 않게
  const shownSeq = useRef(0)
  // 위키 카드가 연 용어 상세를 받는 중(그동안 빈 검색어 목록이 잠깐 비치지 않게 빈 바탕만 그린다)
  const [wikiLoading, setWikiLoading] = useState(false)

  // 선택은 직접 관리한다(cmdk 자동 선택은 지연 렌더링된 목록과 어긋남)
  useEffect(() => {
    setSelected((prev) => nextSelection({ selected: prev, prevQuery: lastQuery.current, query: deferredQuery, items }))
    lastQuery.current = deferredQuery
  }, [deferredQuery, items])

  useEffect(() => {
    void window.sureMate.listItems().then(setAllItems)
  }, [])

  useEffect(
    () =>
      window.sureMate.onShown((payload) => {
        const view = shownView(payload)
        const seq = ++shownSeq.current
        // main이 준 검색어로 시작한다(바의 용어 사전 단추는 '?')
        setQuery(view.query)
        setSelected('')
        void window.sureMate.listItems().then(setAllItems)
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

  const run = (id: string): void => {
    if (!runGuard(id)) return
    if (id === WIKI_ADD_ID) {
      dispatchWiki({ type: 'add', term: parseQuery(query).text })
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
          void window.sureMate.listItems().then(setAllItems)
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
          // 목록이 검색어를 아직 못 따라왔으면 지금 검색어의 맨 위 항목을 실행한다
          if ((e.code !== 'Enter' && e.code !== 'NumpadEnter') || isImeComposing(e.nativeEvent) || query === deferredQuery) return
          e.preventDefault()
          const top = filterItems(allItems, query, index)[0]
          if (top) run(top.id)
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
          <Command.Empty className="px-3 py-10 text-center text-small text-fg-3">찾는 항목이 없어요. / ? &gt; 로 범위를 좁혀 보세요.</Command.Empty>
          {/* 구역 순서는 점수 순: 맨 위 후보가 든 구역이 맨 위 */}
          {groupItems(items).map(({ group, items: groupList }) => {
            return (
              <Command.Group key={group} heading={GROUP_LABELS[group]}>
                {groupList.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => run(item.id)}
                    className="group relative flex h-10 cursor-default items-center gap-3 rounded-control px-3 text-body data-[selected=true]:bg-row-selected"
                  >
                    <span className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-full bg-brand opacity-0 group-data-[selected=true]:opacity-100" />
                    <GroupIcon group={item.group} className="shrink-0 text-fg-3 group-data-[selected=true]:text-brand" />
                    <span className="shrink-0 text-fg">{item.title}</span>
                    {item.subtitle && <span className="min-w-0 truncate text-small text-fg-3">{item.subtitle}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            )
          })}
        </Command.List>
      </Command>
      <StatusBar refreshKey={shownCount} />
    </div>
  )
}
