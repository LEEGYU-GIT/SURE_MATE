import { GLOSSARY_FORMAT, isHttpUrl, normalizedKey, parseGlossaryPack } from '../../shared/glossary/pack'
import { wikiSaveErrorText } from '../../shared/glossary/save-error'
import type { GlossaryEntry, WikiDraft, WikiSaveResult } from '../../shared/glossary/types'
import { errorCode } from '../error-text'

export interface GlossaryRuntimeDeps {
  /** 지금 용어 목록(기본 팩 + 사용자 용어) */
  entries(): Promise<GlossaryEntry[]>
  writeClipboard(text: string): Promise<void>
  /** 설명 복사를 고른 Enter·보조키가 떼어질 때까지 기다린다. 시간 안에 안 떼면 false(그때는 팔레트를 숨기지 않는다) */
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  notify(message: string): void
  openExternal(url: string): Promise<void>
  /** 사용자 파일의 항목(저장할 때 고쳐 쓴다) */
  userEntries(): Promise<GlossaryEntry[]>
  saveUserEntries(entries: GlossaryEntry[]): Promise<void>
  /** 새 항목 id(uuid v4) */
  newId(): string
  /** 지금 시각(ISO) */
  now(): string
  /** id·길이·번호만 넘긴다(용어·설명 금지) */
  log(event: string, data: Record<string, unknown>): void
}

export interface GlossaryRuntime {
  get(id: string): Promise<GlossaryEntry | null>
  /** 설명을 클립보드에 넣고, 누른 Enter를 뗀 뒤 팔레트를 닫아 원래 창으로(시간 안에 안 떼면 열어 둔 채 알림) */
  copy(id: string): Promise<boolean>
  /**
   * 위키 카드의 [설명 복사]: 설명만 클립보드에 넣는다. 팔레트를 숨기거나 창을 앞으로 가져오거나 키를 기다리지 않는다
   * (카드는 포커스를 받지 않는 창이라 쓰던 창이 그대로 앞에 있다. 숨은 팔레트를 닫으면 옛 창이 앞으로 올 수 있다).
   * 그사이 용어가 없어졌으면 false(카드가 그렇다고 알린다)
   */
  copyForCard(id: string): Promise<boolean>
  /** 그 항목의 index번째 링크(http/https만)를 연다 */
  openLink(id: string, index: number): Promise<boolean>
  /**
   * 용어를 추가하거나(id 없음) 고친다(id). 새로 추가할 때 정규화 키가 같은 용어가 있으면 저장하지 않고
   * duplicate로 먼저 보여 준다(설계 문서 §9). allowDuplicate면 둘 다 둔다. 파일에 쓰지 못하면 던지지 않고 errors로 알린다.
   */
  save(draft: unknown, o: { id?: string; allowDuplicate: boolean }): Promise<WikiSaveResult>
  /**
   * 내 용어·가져온 용어를 지운다(설정 창). 기본 용어를 고친 사본을 지우면 기본으로 돌아간다. 기본 용어는 지울 수 없고(builtin),
   * 없는 id는 missing, 파일에 쓰지 못하면 던지지 않고 save-failed. 기록에는 id만.
   */
  remove(id: string): Promise<{ ok: true } | { ok: false; reason: 'builtin' | 'missing' | 'save-failed' }>
}

/** 팩 검사 오류에서 '1번째 항목: '과 끝의 '(id)'를 떼어 화면용으로 */
const plainError = (e: string): string => e.replace(/^\d+번째 항목: /, '').replace(/\([^()]*\)$/, '')

/** 팔레트 위키의 main 쪽 동작(설계 문서 §9 보기) */
export function createGlossaryRuntime(d: GlossaryRuntimeDeps): GlossaryRuntime {
  const find = async (id: string): Promise<GlossaryEntry | null> => (await d.entries()).find((e) => e.id === id) ?? null
  return {
    get: find,
    async copy(id) {
      const entry = await find(id)
      if (!entry) return false
      await d.writeClipboard(entry.definition)
      d.log('wiki.copy', { id, length: entry.definition.length })
      // 누른 채로 원래 창에 돌아가면 자동 반복 Enter가 사용자 문서에 들어간다(프롬프트·상용구·용어 팩 명령과 같은 원칙)
      if (await d.waitKeysReleased()) {
        d.hidePalette(true)
      } else {
        // 상세 화면의 Esc는 목록으로 돌아가고, 목록에서 한 번 더 눌러야 팔레트가 닫힌다
        d.notify('설명을 복사했어요. Enter를 누르고 있어 팔레트를 닫지 않았어요. Esc를 두 번 눌러 팔레트를 닫은 뒤 붙여넣을 곳에서 Ctrl+V를 누르세요.')
        d.log('wiki.copy.keysHeld', { id })
      }
      return true
    },
    async copyForCard(id) {
      const entry = await find(id)
      if (!entry) {
        d.log('wiki.card.copy', { id, missing: true })
        return false
      }
      await d.writeClipboard(entry.definition)
      d.log('wiki.card.copy', { id, length: entry.definition.length })
      return true
    },
    async remove(id) {
      const user = await d.userEntries()
      if (!user.some((e) => e.id === id)) return { ok: false, reason: (await find(id)) ? 'builtin' : 'missing' }
      try {
        await d.saveUserEntries(user.filter((e) => e.id !== id))
      } catch (e) {
        d.log('wiki.delete.failed', { id, error: errorCode(e) })
        return { ok: false, reason: 'save-failed' }
      }
      d.log('wiki.delete', { id })
      return { ok: true }
    },
    async save(draft, o) {
      const entries = await d.entries()
      const base = o.id ? entries.find((e) => e.id === o.id) : undefined
      if (o.id && !base) return { ok: false, errors: ['고칠 용어를 찾지 못했어요. 목록을 다시 열어 주세요'] }
      const fields = typeof draft === 'object' && draft !== null ? (draft as Partial<WikiDraft>) : {}
      if (!base && !o.allowDuplicate) {
        const key = normalizedKey(typeof fields.term === 'string' ? fields.term : '')
        const dup = key ? entries.find((e) => normalizedKey(e.term) === key) : undefined
        if (dup) return { ok: false, duplicate: { id: dup.id, term: dup.term, definition: dup.definition } }
      }
      // 보낸 내용은 팩과 같은 검사를 거친다(renderer를 믿지 않는다). 편집 화면에 작성자 칸이 없으므로 고칠 때는 원래 작성자를 지킨다
      const raw = {
        ...fields,
        ...(base?.author ? { author: base.author } : {}),
        id: base?.id ?? d.newId(),
        source: 'user',
        updatedAt: d.now(),
        version: (base?.version ?? 0) + 1
      }
      const parsed = parseGlossaryPack({ format: GLOSSARY_FORMAT, version: 1, entries: [raw] }, 'user')
      const entry = parsed.entries[0]
      if (!entry || parsed.errors.length) return { ok: false, errors: (parsed.errors.length ? parsed.errors : ['저장할 수 없는 내용이에요']).map(plainError) }
      const user = await d.userEntries()
      const next = user.some((e) => e.id === entry.id) ? user.map((e) => (e.id === entry.id ? entry : e)) : [...user, entry]
      try {
        await d.saveUserEntries(next)
      } catch (e) {
        // 백신 등이 파일을 잡아 다시 해 봐도 못 쓴 경우. 편집 화면이 적은 글을 둔 채 알리도록 결과로 돌려준다(오류 글에는 경로가 있어 코드만 남긴다)
        const code = errorCode(e)
        d.log('wiki.save.error', { id: entry.id, isNew: !base, code })
        return { ok: false, errors: [wikiSaveErrorText(code)] }
      }
      d.log('wiki.save', { id: entry.id, isNew: !base, version: entry.version })
      return { ok: true, entry }
    },
    async openLink(id, index) {
      const link = (await find(id))?.links[index]
      if (!link || !isHttpUrl(link.url)) return false
      d.hidePalette(false)
      await d.openExternal(new URL(link.url).href)
      d.log('wiki.openLink', { id, index })
      return true
    }
  }
}
