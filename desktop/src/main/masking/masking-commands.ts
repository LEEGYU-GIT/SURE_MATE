import type { AppEvent } from '../../shared/app-events'
import { CAPTURE_NOTES, maskingModeLabel } from '../../shared/labels'
import { nextMaskingMode } from '../../shared/masking/modes'
import type { CaptureSkipReason, MaskingMode, PaletteItem } from '../../shared/types'
import { errorText } from '../error-text'
import type { MaskingService } from './masking-service'

/** 팔레트 명령 구역 맨 앞에 넣는 가명 처리 명령(설계 문서 §8 단독 명령) */
export function maskingCommandItems(mode: MaskingMode): PaletteItem[] {
  return [
    {
      id: 'cmd.unmask',
      group: 'command',
      title: '가명 되돌리기',
      subtitle: 'AI가 쓴 글을 복사한 뒤 실행하면 CLIENT_A 같은 가명을 원래 이름으로 바꿔 클립보드에 넣어요',
      keywords: ['unmask', 'restore', '복원', '되돌리기', '원래 이름', '가명']
    },
    {
      id: 'cmd.mask-selection',
      group: 'command',
      title: '선택한 글 가명 처리',
      subtitle: '템플릿 없이 고객사·IP·경로만 가려 클립보드에 넣어요',
      keywords: ['mask', 'masking', '가리기', '익명', '가명']
    },
    {
      id: 'cmd.masking-mode',
      group: 'command',
      title: '가명 처리 기본값 바꾸기',
      subtitle: `지금: ${maskingModeLabel(mode)} · 누르면 ${maskingModeLabel(nextMaskingMode(mode))}`,
      keywords: ['masking', 'mode', '모드', '끄기', '켜기', '가명']
    },
    {
      id: 'cmd.open-dictionary',
      group: 'command',
      title: '가명 사전 열기',
      subtitle: '가릴 고객사·프로젝트 이름을 적는 파일(이 PC에만 저장)',
      keywords: ['dictionary', 'masking', '사전', '고객사', '가명']
    }
  ]
}

export interface MaskingCommandDeps {
  masking: Pick<MaskingService, 'mask' | 'unmask' | 'tableSize'>
  /** 설정의 전체 기본 모드 */
  getMode(): MaskingMode
  /** 전체 기본 모드를 바꿔 저장하고 트레이 표시를 고친다 */
  setMode(mode: MaskingMode): Promise<void>
  readClipboard(): Promise<string>
  /** excludeFromHistory면 Win+V 기록·클라우드 동기화에서 뺀다(실명이 든 글) */
  writeClipboard(text: string, o: { excludeFromHistory: boolean }): Promise<void>
  hidePalette(restoreFocus: boolean): void
  /** 명령을 고른 Enter·보조키를 뗄 때까지 기다린다. 시간 안에 안 떼면 false(그때는 팔레트를 숨기지 않는다) */
  waitKeysReleased(): Promise<boolean>
  /** Enter 떼기를 기다려 팔레트를 숨기고 직전 창에서 선택한 글을 가져온다 */
  captureSelection(): Promise<{ text: string | null; skipped?: CaptureSkipReason }>
  /** 사전 파일이 없으면 가상 예시로 만들고 경로를 돌려준다 */
  ensureDictionary(): Promise<string>
  /** 기본 프로그램으로 연다. 실패하면 까닭(빈 글이면 성공) */
  openFile(path: string): Promise<string>
  showInFolder(path: string): void
  notify(message: string): void
  /** 길이·건수만 넘긴다(글·이름·토큰 금지) */
  log(event: string, data: Record<string, unknown>): void
  /** 말랑 메이트에 앱 일을 알린다(되돌림, 가져오지 못함). 글·이름은 담지 않는다 */
  emit(e: AppEvent): void
}

export interface MaskingCommands {
  /** 가명 처리 명령이면 실행하고 true, 아니면 false */
  run(id: string): Promise<boolean>
}

const UNKNOWN_SHOWN = 3

/** 가명 처리 단독 명령(설계 문서 §7 흐름 5단계, §8) */
export function createMaskingCommands(d: MaskingCommandDeps): MaskingCommands {
  /** 누른 채로 숨기면 자동 반복 Enter가 원래 앱으로 가므로, 뗀 것을 확인했을 때만 숨긴다 */
  const hideAfterKeys = async (restoreFocus: boolean): Promise<void> => {
    if (await d.waitKeysReleased()) d.hidePalette(restoreFocus)
  }

  const unmask = async (): Promise<void> => {
    await hideAfterKeys(true)
    const text = await d.readClipboard()
    if (!text.trim()) {
      d.notify('클립보드가 비어 있어요. AI 답을 복사한 뒤 다시 실행해 주세요.')
      return
    }
    const r = d.masking.unmask(text)
    const tableSize = d.masking.tableSize()
    d.log('masking.unmask', { inputLength: text.length, restored: r.restored, unknown: r.unknownTokens.length, tableSize })
    // 토큰은 이름이 아니라 알림에 보여도 된다(로그에는 남기지 않는다)
    const more = r.unknownTokens.length > UNKNOWN_SHOWN ? ` 외 ${r.unknownTokens.length - UNKNOWN_SHOWN}개` : ''
    const unknown = r.unknownTokens.length ? ` · 모르는 표시 그대로 둠: ${r.unknownTokens.slice(0, UNKNOWN_SHOWN).join(', ')}${more}` : ''
    if (r.restored === 0) {
      d.notify(
        tableSize === 0
          ? '가명 대응표가 비어 있어 되돌릴 수 없어요. 앱을 다시 켰거나 한동안 쓰지 않으면 대응표가 지워져요.'
          : `되돌릴 가명이 없어요${unknown}.`
      )
      return
    }
    await d.writeClipboard(r.text, { excludeFromHistory: true })
    d.emit({ type: 'unmasked', restored: r.restored })
    d.notify(`되돌렸어요 · 이름 ${r.restored}건${unknown}. 붙여넣을 곳에서 Ctrl+V를 누르세요.`)
  }

  const maskSelection = async (): Promise<void> => {
    const captured = await d.captureSelection()
    const text = captured.text ?? ''
    if (!text.trim()) {
      const reason = captured.skipped ?? 'nothing-selected'
      d.notify(`${CAPTURE_NOTES[reason]}. 글을 선택한 뒤 다시 실행해 주세요.`)
      // busy(다른 가져오기가 진행 중)는 먼저 시작한 쪽이 처리한다
      if (reason !== 'busy') d.emit({ type: 'capture-failed', reason })
      return
    }
    const configured = d.getMode()
    // 가려 달라고 직접 고른 명령이므로 기본값이 꺼짐이어도 되돌리기로 가린다
    const mode: MaskingMode = configured === 'off' ? 'restore' : configured
    const m = await d.masking.mask(text, { mode, disabledKeys: [], dryRun: false })
    const masked = m.items.filter((i) => i.enabled).reduce((n, i) => n + i.count, 0)
    d.log('masking.maskSelection', { inputLength: text.length, outputLength: m.text.length, mode, masked })
    if (masked === 0) {
      d.notify('가릴 고객사·IP·경로를 찾지 못했어요. 클립보드는 그대로예요.')
      return
    }
    await d.writeClipboard(m.text, { excludeFromHistory: false })
    const note = configured === 'off' ? '(기본값이 꺼짐이라 되돌리기로 가림)' : ''
    // 사전이 깨졌으면 이름이 안 가려졌을 수 있으니 같이 알린다
    const warning = m.warnings.length ? ` ${m.warnings[0]}.` : ''
    d.notify(`가명 처리해 복사했어요 · 가명 ${masked}건${note}. 붙여넣을 곳에서 Ctrl+V를 누르세요.${warning}`)
  }

  const cycleMode = async (): Promise<void> => {
    await hideAfterKeys(true)
    const next = nextMaskingMode(d.getMode())
    await d.setMode(next)
    d.notify(`가명 처리 기본값: ${maskingModeLabel(next)}${next === 'off' ? ' — 이제 원문 그대로 복사돼요' : ''}`)
    d.log('masking.mode', { mode: next })
  }

  const openDictionary = async (): Promise<void> => {
    await hideAfterKeys(false)
    const path = await d.ensureDictionary()
    const error = await d.openFile(path)
    if (error) {
      d.showInFolder(path)
      d.notify('사전 파일(.json)을 열 프로그램이 없어 폴더를 열었어요. 메모장으로 열어 고쳐 주세요.')
    }
    d.log('masking.openDictionary', { opened: !error })
  }

  const handlers = new Map<string, () => Promise<void>>([
    ['cmd.unmask', unmask],
    ['cmd.mask-selection', maskSelection],
    ['cmd.masking-mode', cycleMode],
    ['cmd.open-dictionary', openDictionary]
  ])

  return {
    async run(id) {
      const handler = handlers.get(id)
      if (!handler) return false
      try {
        await handler()
      } catch (e) {
        d.log('masking.commandError', { id, error: errorText(e) })
        d.notify('처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.')
      }
      return true
    }
  }
}
