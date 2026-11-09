import type { FlyoutAction } from '../../shared/flyout/flyout-content'
import type { ShownPayload } from '../../shared/ipc-channels'

export interface WikiCardActionDeps {
  /** 설명만 클립보드에(팔레트 위키의 설명 복사와 같은 동작). 용어가 없으면 false */
  copy(id: string): Promise<boolean>
  pin(pinned: boolean): void
  close(reason: string): void
  showPalette(p: ShownPayload): void
  lookupClipboard(): Promise<void>
}

/**
 * 위키 카드 단추(설계 문서 §9). 위키 카드 동작이 아니면 null을 돌려준다(펼침 창의 다른 처리기가 맡는다).
 * 팔레트로 넘어갈 때는 카드를 먼저 닫는다(같은 내용이 두 곳에 남지 않게). 복사는 카드를 남겨 '복사했어요'를 보인다.
 */
export function createWikiCardActions(d: WikiCardActionDeps): (a: FlyoutAction) => Promise<boolean> | null {
  return (a) => {
    switch (a.type) {
      case 'wiki-copy':
        return d.copy(a.id)
      case 'wiki-pin':
        d.pin(a.pinned)
        return Promise.resolve(true)
      case 'wiki-open':
        d.close('open-palette')
        d.showPalette({ mode: 'wiki', id: a.id })
        return Promise.resolve(true)
      case 'wiki-search':
        // 결과가 없으면 팔레트가 "직접 추가하기"를 보인다(검색어가 새 용어 이름으로 들어간다)
        d.close('open-palette')
        d.showPalette({ mode: 'search', query: `?${a.query}` })
        return Promise.resolve(true)
      case 'wiki-clipboard':
        return d.lookupClipboard().then(() => true)
      default:
        return null
    }
  }
}
