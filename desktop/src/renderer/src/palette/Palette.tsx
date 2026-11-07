import { Command } from 'cmdk'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createExecutionGuard } from '../../../shared/execution-guard'
import { isImeComposing } from '../../../shared/ime'
import { DevOutput } from './DevOutput'
import { filterItems } from './filter-items'
import { GROUPS, MOCK_ITEMS } from './mock-items'
import { nextSelection } from './selection'
import { StatusBar } from './StatusBar'

/** 같은 항목을 300ms 안에 두 번 실행하지 않는다(한글 조합 중 Enter 중복 대비) */
const runGuard = createExecutionGuard(300)

export function Palette(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [dev, setDev] = useState<{ title: string; text: string } | null>(null)
  const [shownCount, setShownCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // 입력값은 그대로 두고, 목록만 지연 값으로 그린다(조합 중 입력이 끊기지 않게)
  const deferredQuery = useDeferredValue(query)
  const items = useMemo(() => filterItems(MOCK_ITEMS, deferredQuery), [deferredQuery])
  const [selected, setSelected] = useState('')
  const lastQuery = useRef('')

  // 선택은 직접 관리한다(cmdk 자동 선택은 지연 렌더링된 목록과 어긋남)
  useEffect(() => {
    setSelected((prev) => nextSelection({ selected: prev, prevQuery: lastQuery.current, query: deferredQuery, items }))
    lastQuery.current = deferredQuery
  }, [deferredQuery, items])

  useEffect(
    () =>
      window.sureMate.onShown((payload) => {
        setQuery('')
        setSelected(MOCK_ITEMS[0]?.id ?? '')
        setShownCount((n) => n + 1)
        setDev(payload.mode === 'dev-output' ? { title: payload.title, text: payload.text } : null)
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

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-zinc-900/85 text-zinc-100"
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
          // 목록이 검색어를 아직 못 따라왔으면 지금 검색어의 맨 위 항목을 실행한다
          if ((e.code !== 'Enter' && e.code !== 'NumpadEnter') || isImeComposing(e.nativeEvent) || query === deferredQuery) return
          e.preventDefault()
          const top = filterItems(MOCK_ITEMS, query)[0]
          if (top) run(top.id)
        }}
      >
        <Command.Input
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          autoFocus
          spellCheck={false}
          placeholder="무엇을 할까요?   ? 위키 · ! 상용구 · / 프롬프트 · @ 워크스페이스 · > 명령"
          className="h-14 w-full shrink-0 border-b border-white/10 bg-transparent px-5 text-lg outline-none placeholder:text-sm placeholder:text-zinc-500"
        />
        <Command.List className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-zinc-500">결과가 없어요</Command.Empty>
          {GROUPS.map((group) => {
            const groupItems = items.filter((item) => item.group === group.id)
            if (groupItems.length === 0) return null
            return (
              <Command.Group key={group.id} heading={group.label}>
                {groupItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => run(item.id)}
                    className="flex cursor-default items-center justify-between rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-white/10"
                  >
                    <span>{item.title}</span>
                    {item.subtitle && <span className="ml-4 truncate text-xs text-zinc-400">{item.subtitle}</span>}
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
