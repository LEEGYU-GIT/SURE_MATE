import { useEffect, useRef } from 'react'
import type { GlossaryEntry } from '../../../shared/glossary/types'
import { isImeComposing } from '../../../shared/ime'
import { WikiIcon } from '../design/icons'
import { sourceLabel, wikiKeyToAction } from './wiki-state'

/** 용어 상세(설계 문서 §9 보기). Enter 설명 복사, 숫자 링크 열기, E 수정, Esc 목록으로 */
export function WikiDetail(props: { entry: GlossaryEntry; onBack: () => void; onEdit?: () => void }): React.JSX.Element {
  const { entry } = props
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => rootRef.current?.focus(), [])

  const copy = (): void => {
    void window.sureMate.copyWikiDefinition(entry.id)
  }
  const openLink = (index: number): void => {
    void window.sureMate.openWikiLink(entry.id, index)
  }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="flex h-screen flex-col overflow-hidden bg-surface-palette font-ui text-fg outline-none"
      onKeyDown={(e) => {
        const action = wikiKeyToAction(
          { code: e.code, key: e.key, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, isComposing: isImeComposing(e.nativeEvent), repeat: e.repeat },
          entry
        )
        if (!action || (action.type === 'edit' && !props.onEdit)) return
        e.preventDefault()
        if (action.type === 'copy') copy()
        else if (action.type === 'back') props.onBack()
        else if (action.type === 'edit') props.onEdit?.()
        else openLink(action.index)
      }}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-5">
        <WikiIcon size={18} className="shrink-0 text-brand" />
        <span className="min-w-0 truncate text-title font-semibold">{entry.term}</span>
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-caption text-fg-3">{sourceLabel(entry.source)}</span>
        <span className="ml-auto shrink-0 text-caption text-fg-3">Esc 목록으로</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {entry.aliases.length > 0 && <div className="text-small text-fg-3 select-text">{entry.aliases.join(' · ')}</div>}
        <p className="text-body leading-relaxed whitespace-pre-wrap text-fg select-text">{entry.definition}</p>
        {entry.example && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-caption text-fg-3">사용 예</h3>
            <p className="rounded-window border border-line bg-surface-inset px-3 py-2 text-small leading-relaxed whitespace-pre-wrap text-fg-2 select-text">
              {entry.example}
            </p>
          </section>
        )}
        {entry.links.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-caption text-fg-3">링크</h3>
            <div className="flex flex-col items-start gap-1">
              {entry.links.map((link, i) => (
                <button
                  // 같은 주소가 두 번 들어 있을 수 있어 번호를 붙인다
                  key={`${i}:${link.url}`}
                  type="button"
                  tabIndex={-1}
                  onClick={() => openLink(i)}
                  title={link.url}
                  className="flex max-w-full items-center gap-2 rounded-control px-1 text-small text-fg-2 hover:bg-row-hover"
                >
                  <kbd className="shrink-0 rounded-control border border-line px-1.5 font-ui text-caption text-fg-3">{i + 1}</kbd>
                  <span className="truncate text-brand">{link.title}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-line px-2 py-0.5 text-caption text-fg-3">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex h-11 shrink-0 items-center gap-3 border-t border-line px-4 text-caption text-fg-3">
        <span className="min-w-0 truncate">
          {[props.onEdit ? 'E 수정' : null, entry.links.length ? `1~${entry.links.length} 링크 열기` : null, 'Esc 목록으로'].filter(Boolean).join(' · ')}
        </span>
        <button
          type="button"
          tabIndex={-1}
          onClick={copy}
          className="ml-auto h-7 shrink-0 rounded-control bg-brand px-3 text-small font-semibold text-ink transition-opacity duration-[120ms] hover:opacity-90"
        >
          ↵ 설명 복사
        </button>
      </div>
    </div>
  )
}
