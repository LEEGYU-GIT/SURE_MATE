import { labelParts } from './menu-model'

/**
 * 바 항목에 400ms 머물면 옆에 뜨는 이름표(12px, 한 줄 높이 24, 최대 너비 240).
 * "이름 · 보조 글"이면 보조 글을 흐리게 그리고, 단축키면 키 모양 바탕을 깐다(이름표가 단축키를 알려 준다).
 * 길면 줄을 고르게 나누고(한 낱말만 다음 줄에 남지 않게), 보조 글은 통째로 이름 뒤나 다음 줄 처음에 온다.
 * 이름 뒤 간격은 이름의 오른쪽 여백이라 보조 글이 다음 줄로 가도 들여 쓰지 않는다. 한글은 낱말 중간에서 끊지 않는다.
 */
export function Label({ text }: { text: string }): React.JSX.Element {
  const { name, hint, hintIsKey } = labelParts(text)
  return (
    <div role="tooltip" className="px-2 py-1 text-caption leading-4 text-balance break-keep">
      <span className={`text-fg ${hint === null ? '' : 'mr-2'}`}>{name}</span>
      {hint === null ? null : (
        <>
          <wbr />
          {hintIsKey ? (
            <kbd className="rounded-control bg-row-selected px-1 font-ui whitespace-nowrap text-fg-2">{hint}</kbd>
          ) : (
            <span className="whitespace-nowrap text-fg-2">{hint}</span>
          )}
        </>
      )}
    </div>
  )
}
