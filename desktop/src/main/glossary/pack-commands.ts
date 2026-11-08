import { exportPack, mergeImport, packFileName, previewImport } from '../../shared/glossary/merge'
import { parseGlossaryPack } from '../../shared/glossary/pack'
import type { GlossaryEntry } from '../../shared/glossary/types'
import type { PaletteItem } from '../../shared/types'
import { errorText } from '../error-text'

/** 가져올 팩 파일 크기 상한 */
export const PACK_MAX_BYTES = 5 * 1024 * 1024

/** 팔레트 명령(설계 문서 §9 용어 팩 나누기) */
export function packCommandItems(): PaletteItem[] {
  return [
    {
      id: 'cmd.glossary-export',
      group: 'command',
      title: '용어 팩 내보내기',
      subtitle: '내가 추가·고친 용어를 파일로 저장해 팀과 나눠요',
      keywords: ['glossary', 'export', '용어', '위키', '팩', '공유']
    },
    {
      id: 'cmd.glossary-import',
      group: 'command',
      title: '용어 팩 가져오기',
      subtitle: '받은 용어 팩 파일을 미리 보고 내 용어에 더해요',
      keywords: ['glossary', 'import', '용어', '위키', '팩', '공유']
    }
  ]
}

export interface PackCommandDeps {
  glossary(): Promise<{ entries: GlossaryEntry[]; userEntries: GlossaryEntry[] }>
  saveUserEntries(list: GlossaryEntry[]): Promise<void>
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  /** 저장할 경로(취소하면 null) */
  showSaveDialog(defaultName: string): Promise<string | null>
  /** 열 파일 경로(취소하면 null) */
  showOpenDialog(): Promise<string | null>
  writeFile(path: string, text: string): Promise<void>
  /** PACK_MAX_BYTES를 넘으면 too-big */
  readFile(path: string): Promise<{ text: string } | { error: 'too-big' | 'read-failed' }>
  /** 확인 상자. detail은 미리 보기 숫자 */
  confirm(detail: string): Promise<boolean>
  notify(message: string): void
  /** 건수만(용어·설명·경로 금지) */
  log(event: string, data: Record<string, unknown>): void
  now(): Date
}

export function createPackCommands(d: PackCommandDeps): { run(id: string): Promise<boolean> } {
  const hide = async (): Promise<void> => {
    // 대화상자가 팔레트(늘 맨 앞) 뒤에 가리지 않게 먼저 숨긴다. 누른 Enter가 원래 앱으로 가지 않게 뗀 뒤에
    if (await d.waitKeysReleased()) d.hidePalette(false)
  }

  const exportCommand = async (): Promise<void> => {
    await hide()
    const { userEntries } = await d.glossary()
    if (userEntries.length === 0) {
      d.notify('내보낼 내 용어가 없어요. 용어를 추가하거나 고친 뒤 내보내 주세요.')
      return
    }
    const path = await d.showSaveDialog(packFileName(d.now()))
    if (!path) return
    await d.writeFile(path, exportPack(userEntries, d.now().toISOString()))
    d.notify(`용어 ${userEntries.length}개를 내보냈어요. 팀 공유 폴더나 게시글 댓글로 나눌 수 있어요.`)
    d.log('glossary.export', { count: userEntries.length })
  }

  const importCommand = async (): Promise<void> => {
    await hide()
    const path = await d.showOpenDialog()
    if (!path) return
    const file = await d.readFile(path)
    if ('error' in file) {
      d.notify(file.error === 'too-big' ? '5MB가 넘는 파일은 가져오지 않아요.' : '파일을 읽지 못했어요.')
      d.log('glossary.import.failed', { reason: file.error })
      return
    }
    let raw: unknown
    try {
      raw = JSON.parse(file.text.replace(/^\uFEFF/, ''))
    } catch {
      d.notify('용어 팩 파일이 아니에요(JSON을 읽지 못함).')
      d.log('glossary.import.failed', { reason: 'json' })
      return
    }
    const parsed = parseGlossaryPack(raw, 'imported')
    if (parsed.entries.length === 0) {
      d.notify('가져올 용어가 없어요. Sure-Mate 용어 팩(sure-mate-glossary) 파일인지 확인해 주세요.')
      d.log('glossary.import.failed', { reason: 'empty', errors: parsed.errors.length })
      return
    }
    const { entries, userEntries } = await d.glossary()
    const p = previewImport(entries, parsed.entries)
    const skipped = parsed.errors.length ? ` · 건너뛴 항목 ${parsed.errors.length}` : ''
    const detail = `새 용어 ${p.added} · 바뀐 용어 ${p.changed} · 이름이 겹치는 용어 ${p.sameName} · 그대로 ${p.unchanged}${skipped}`
    if (!(await d.confirm(detail))) return
    await d.saveUserEntries(mergeImport(userEntries, entries, parsed.entries))
    d.notify(`가져왔어요 · ${detail}`)
    d.log('glossary.import', { ...p, skipped: parsed.errors.length })
  }

  const handlers = new Map<string, () => Promise<void>>([
    ['cmd.glossary-export', exportCommand],
    ['cmd.glossary-import', importCommand]
  ])

  return {
    async run(id) {
      const handler = handlers.get(id)
      if (!handler) return false
      try {
        await handler()
      } catch (e) {
        d.log('glossary.commandError', { id, error: errorText(e) })
        d.notify('처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.')
      }
      return true
    }
  }
}
