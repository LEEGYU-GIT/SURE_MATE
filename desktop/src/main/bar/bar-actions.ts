import type { BarPressKind } from '../../shared/bar/bar-ipc'
import type { BarShape } from '../../shared/bar/bar-settings'
import { createExecutionGuard } from '../../shared/execution-guard'
import type { FlyoutAction } from '../../shared/flyout/flyout-content'
import type { ShownPayload } from '../../shared/ipc-channels'
import type { MaskingMode } from '../../shared/types'
import { errorCode } from '../error-text'

/** 같은 바 단추를 이 시간 안에 두 번 누르면 한 번만 실행한다(팔레트 항목 실행과 같은 300ms) */
export const BAR_ACTION_GUARD_MS = 300

/** 바 단추·펼침 창 메뉴를 처리하지 못했을 때 알림(가명 처리·용어 팩 명령과 같은 문구) */
export const BAR_ACTION_FAILED = '처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.'

const PROMPT_PREFIX = 'prompt:'

export interface BarActionDeps {
  /** 지금 바에 있는 항목 id인지(renderer가 보낸 id는 믿지 않는다) */
  isKnown(id: string): boolean
  /** 팔레트를 열고 닫는다(단축키와 같음) */
  togglePalette(): void
  openPalette(p: ShownPayload): void
  toggleMenu(kind: 'masking-menu' | 'workspace-menu', itemId: string): void | Promise<void>
  /** 고정 프롬프트를 지금 선택한 글로 실행(PromptSession.runFromBar). 실패하면 거부한다 */
  runPrompt(templateId: string): Promise<unknown>
  /** 실행 중 표시(바 항목 id, 끄면 null) */
  setBusy(itemId: string | null): void
  togglePet(): Promise<void>
  openSettings(): Promise<void>
  notify(message: string): void
  /** id·길이·오류 코드만 넘긴다(선택 글·프롬프트 내용 금지) */
  log(event: string, data: Record<string, unknown>): void
}

/**
 * 바 단추를 누르면 하는 일(설계 §14-1 항목). 어떤 단추든 실패해도 던지지 않고 오류 코드만 기록한 뒤 알린다.
 * 실행 중 표시는 먼저 누른 고정 프롬프트 하나만 켠다: 실행 중에 다른 프롬프트를 누르면 세션이 막고(busy),
 * 그 단추가 먼저 누른 단추의 표시를 끄지 않게 한다.
 */
export function createBarActions(d: BarActionDeps, now: () => number = Date.now): { run(id: string, how?: BarPressKind | null): Promise<void> } {
  const guard = createExecutionGuard(BAR_ACTION_GUARD_MS, now)
  let busyItem: string | null = null

  const runPrompt = async (id: string): Promise<void> => {
    const mine = busyItem === null
    if (mine) {
      busyItem = id
      d.setBusy(id)
    }
    try {
      await d.runPrompt(id.slice(PROMPT_PREFIX.length))
    } finally {
      if (mine) {
        busyItem = null
        d.setBusy(null)
      }
    }
  }

  const handle = async (id: string): Promise<void> => {
    switch (id) {
      case 'logo':
        return d.togglePalette()
      case 'masking':
        return d.toggleMenu('masking-menu', 'masking')
      case 'workspace':
        return d.toggleMenu('workspace-menu', 'workspace')
      case 'glossary':
        return d.openPalette({ mode: 'search', query: '?' })
      case 'pet':
        return d.togglePet()
      case 'settings':
        return d.openSettings()
      default:
        if (id.startsWith(PROMPT_PREFIX)) return runPrompt(id)
    }
  }

  return {
    async run(id, how = null) {
      if (!d.isKnown(id)) {
        // 모르는 id는 내용일 수 있어 길이만 남긴다
        d.log('bar.action.unknown', { length: id.length })
        return
      }
      if (!guard(id)) return
      // press: 뗌으로 실행(up), 누름 없이 뗌만 옴(up-only, Windows가 누름을 보내지 않는 상태), 보조 기술의 click
      d.log('bar.action', how ? { id, press: how } : { id })
      try {
        await handle(id)
      } catch (e) {
        d.log('bar.action.failed', { id, error: errorCode(e) })
        d.notify(BAR_ACTION_FAILED)
      }
    }
  }
}

export interface FlyoutActionDeps {
  /** 가명 처리 기본값을 저장하고 트레이·바를 갱신한다 */
  setMaskingMode(mode: MaskingMode): Promise<void>
  /** 바 모양을 저장하고 바를 갱신한다 */
  saveBarShape(shape: BarShape): Promise<void>
  unsnoozeBar(): void
  snoozeBar(): void
  openSettings(): Promise<void>
  /** 펼침 창을 닫는다(reason은 flyout.hide 로그에 남는다) */
  close(reason: string): void
  /** 위키 카드 [설명 복사]: 설명만 클립보드에 넣는다(팔레트·포커스는 그대로). 용어가 없어졌으면 false */
  copyWiki(id: string): Promise<boolean>
  /** 위키 카드 [고정] */
  pinCard(pinned: boolean): void
  /** 팔레트를 연다(용어 상세 또는 시작 검색어) */
  openPalette(p: ShownPayload): void
  /** 위키 카드 [클립보드 글로 찾기]: 클립보드 글로 다시 찾아 새 카드를 띄운다 */
  lookupClipboard(): Promise<void>
  /**
   * 워크스페이스 메뉴 행: 불러오기·지금 배치 저장·모두 보기(메뉴를 닫은 뒤 부르고 끝나기를 기다리지 않는다).
   * 결과 알림(이름 포함)·바쁨·Win32 불가는 워크스페이스 서비스가 알린다
   */
  workspaceAction(a: Extract<FlyoutAction, { type: 'workspace-run' | 'workspace-save' | 'workspace-edit' }>): Promise<boolean>
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
}

/** 기록에 남겨도 되는 동작 값(정해진 모드·모양 이름뿐. 위키 카드의 용어 id·검색어는 남기지 않는다) */
function actionLog(a: FlyoutAction): Record<string, unknown> {
  if (a.type === 'set-masking') return { type: a.type, mode: a.mode }
  if (a.type === 'set-bar-shape') return { type: a.type, shape: a.shape }
  return { type: a.type }
}

/**
 * 펼침 창 메뉴 행·단추. 처리했으면 true. 메뉴는 고르면 닫는다(포커스를 받지 않는 창이라 blur로 닫히지 않는다).
 * 위키 카드: [설명 복사]·[고정]은 카드를 그대로 두고(복사 결과는 카드가 1.5초 보여 준다), 팔레트로 넘기는 단추는
 * 카드를 닫은 뒤 팔레트를 연다. [클립보드 글로 찾기]는 새 카드가 지금 카드를 바꾼다.
 */
export function createFlyoutActions(d: FlyoutActionDeps): { run(a: FlyoutAction): Promise<boolean> } {
  /** 실패하면 던지지 않고 오류 코드만 기록하고 알린다(메뉴는 이미 닫혔다) */
  const failed = (a: FlyoutAction, e: unknown): void => {
    d.log('flyout.action.failed', { type: a.type, error: errorCode(e) })
    d.notify(BAR_ACTION_FAILED)
  }

  const handle = async (a: FlyoutAction): Promise<boolean> => {
    switch (a.type) {
      case 'set-masking':
        await d.setMaskingMode(a.mode)
        d.close('select')
        return true
      case 'set-bar-shape':
        // 저장한 뒤 잠시 숨김을 푼다(모양을 고르면 바가 다시 보여야 한다)
        await d.saveBarShape(a.shape)
        d.unsnoozeBar()
        d.close('select')
        return true
      case 'snooze-bar':
        d.close('select')
        d.snoozeBar()
        return true
      case 'open-settings':
        d.close('select')
        await d.openSettings()
        return true
      case 'close':
        d.close('button')
        return true
      case 'wiki-copy':
        // 결과가 그대로 카드의 표시가 된다(true: 복사했어요, false: 지워진 용어)
        return d.copyWiki(a.id)
      case 'wiki-pin':
        d.pinCard(a.pinned)
        return true
      case 'wiki-open':
        d.close('palette')
        d.openPalette({ mode: 'wiki', id: a.id })
        return true
      case 'wiki-search':
        // 결과가 없으면 팔레트가 "직접 추가하기"를 보여 준다
        d.close('palette')
        d.openPalette({ mode: 'search', query: `?${a.query}` })
        return true
      case 'wiki-clipboard':
        await d.lookupClipboard()
        return true
      case 'workspace-run':
      case 'workspace-save':
      case 'workspace-edit':
        // 닫은 뒤 실행한다: 바를 눌러도 포커스는 원래 창에 있어 저장·불러오기 대상에 Sure-Mate 창이 없다.
        // 끝나기를 기다리지 않는다(A-I1): 불러오기(2~10초)나 다른 모니터 구성 질문이 끝날 때까지 답하지 않으면
        // 펼침 창이 그동안 위키 카드 단추·가명 처리·바 메뉴 누름을 알림 없이 버린다
        d.close('select')
        void d.workspaceAction(a).catch((e: unknown) => failed(a, e))
        return true
    }
  }

  return {
    async run(a) {
      try {
        const handled = await handle(a)
        if (handled) d.log('flyout.action', actionLog(a))
        return handled
      } catch (e) {
        failed(a, e)
        d.close('error')
        return false
      }
    }
  }
}
