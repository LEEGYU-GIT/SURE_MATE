import { exportPack, mergeImport, packFileName, previewImport } from '../../shared/glossary/merge'
import { parseGlossaryPack } from '../../shared/glossary/pack'
import type { GlossaryEntry } from '../../shared/glossary/types'
import type { PaletteItem } from '../../shared/types'
import { errorCode } from '../error-text'

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
  /** userBroken: 내 용어 파일이 있는데 한 항목도 읽지 못함 */
  glossary(): Promise<{ entries: GlossaryEntry[]; userEntries: GlossaryEntry[]; userBroken: boolean }>
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
    const { userEntries, userBroken } = await d.glossary()
    if (userEntries.length === 0) {
      d.notify(
        userBroken
          ? '내 용어 파일(glossary.json)을 읽지 못해 내보낼 수 없어요. 파일이 깨졌거나 다른 프로그램이 쓰고 있을 수 있어요.'
          : '내보낼 내 용어가 없어요. 용어를 추가하거나 고친 뒤 내보내 주세요.'
      )
      d.log('glossary.export.empty', { userBroken })
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
    // 통째로 건너뛴 항목과, 들어가되 허용되지 않는 링크·넘치는 태그 등을 뺀 항목을 따로 보인다(앞의 네 숫자가 실제 반영 수)
    const skipped = parsed.skipped ? ` · 건너뛴 항목 ${parsed.skipped}` : ''
    const trimmed = parsed.trimmed ? ` · 그중 링크·태그 등 일부 값을 뺀 용어 ${parsed.trimmed}` : ''
    const detail = `새 용어 ${p.added} · 바뀐 용어 ${p.changed} · 이름이 겹치는 용어 ${p.sameName} · 그대로 ${p.unchanged}${skipped}${trimmed}`
    if (!(await d.confirm(detail))) return
    await d.saveUserEntries(mergeImport(userEntries, entries, parsed.entries))
    d.notify(`가져왔어요 · ${detail}`)
    d.log('glossary.import', { ...p, skipped: parsed.skipped, trimmed: parsed.trimmed })
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
        // 오류 글에는 팩 파일 경로·이름(고객사명일 수 있음)이 들어가므로 코드만 남긴다
        d.log('glossary.commandError', { id, code: errorCode(e) })
        d.notify('처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.')
      }
      return true
    }
  }
}
