import { Command } from 'cmdk'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createExecutionGuard } from '../../../shared/execution-guard'
import { isImeComposing } from '../../../shared/ime'
import type { PromptDraft } from '../../../shared/ipc-channels'
import { PALETTE_GROUPS } from '../../../shared/palette-query'
import type { PaletteItem } from '../../../shared/types'
import { GroupIcon, SearchIcon } from '../design/icons'
import { Confirm } from './Confirm'
import { isRepeatedEnter } from './confirm-state'
import { DevOutput } from './DevOutput'
import { filterItems } from './filter-items'
import { nextSelection } from './selection'
import { StatusBar } from './StatusBar'

/** 같은 항목을 300ms 안에 두 번 실행하지 않는다(한글 조합 중 Enter 중복 대비) */
const runGuard = createExecutionGuard(300)

const PREFIX_HINTS = [
  ['/', '프롬프트'],
  ['?', '위키'],
  ['>', '명령']
] as const

export function Palette(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [allItems, setAllItems] = useState<PaletteItem[]>([])
  const [dev, setDev] = useState<{ title: string; text: string } | null>(null)
  const [confirm, setConfirm] = useState<PromptDraft | null>(null)
  const [shownCount, setShownCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // 입력값은 그대로 두고, 목록만 지연 값으로 그린다(조합 중 입력이 끊기지 않게)
  const deferredQuery = useDeferredValue(query)
  const items = useMemo(() => filterItems(allItems, deferredQuery), [allItems, deferredQuery])
  const [selected, setSelected] = useState('')
  const lastQuery = useRef('')

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
        setQuery('')
        setSelected('')
        void window.sureMate.listItems().then(setAllItems)
        setShownCount((n) => n + 1)
        setDev(payload.mode === 'dev-output' ? { title: payload.title, text: payload.text } : null)
        setConfirm(payload.mode === 'confirm' ? payload.draft : null)
        requestAnimationFrame(() => inputRef.current?.focus())
      }),
    []
  )

  const close = (): void => {
    inputRef.current?.blur()
    window.sureMate.hide()
  }

  const run = (id: string): void => {
    if (runGuard(id)) void window.sureMate.runItem(id)
  }

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
          const top = filterItems(allItems, query)[0]
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
          {PALETTE_GROUPS.map((group) => {
            const groupItems = items.filter((item) => item.group === group.id)
            if (groupItems.length === 0) return null
            return (
              <Command.Group key={group.id} heading={group.label}>
                {groupItems.map((item) => (
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
