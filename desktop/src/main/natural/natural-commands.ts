import type { PaletteItem } from '../../shared/types'
import { type IntentPack } from '../../shared/natural/intent-pack'
import { parsePick } from '../../shared/natural/natural-ipc'
import { NATURAL_NOTES } from '../../shared/natural/natural-view'
import { understand } from '../../shared/natural/understand'
import { errorText } from '../error-text'

/** 팔레트 명령 구역에 넣는 말하듯 입력 명령(가명 사전 열기 다음) */
export function naturalCommandItems(): PaletteItem[] {
  return [
    {
      id: 'cmd.open-intents',
      group: 'command',
      title: '말하듯 입력 단어 목록 열기',
      subtitle: '‘해줘’ 같은 어미와 의도 단어를 고치는 파일(이 PC에만 저장)',
      keywords: ['intents', 'natural', '단어', '말하듯', '어미', '조사']
    }
  ]
}

/** 단어 목록 파일 열기에 쓰는 기능(팔레트 명령과 설정 창 말하듯 입력 탭이 같이 쓴다) */
export interface IntentFileDeps {
  /** 사용자 단어 목록 파일이 없으면 기본 목록으로 만들고 경로를 돌려준다 */
  ensure(): Promise<string>
  /** 기본 프로그램으로 연다. 실패하면 까닭(빈 글이면 성공) */
  openFile(path: string): Promise<string>
  showInFolder(path: string): void
  /** Windows 알림. 열 프로그램이 없을 때 팔레트 명령만 쓴다(설정 창 탭은 같은 문구를 탭 안 경고 줄로 보인다) */
  notify(message: string): void
  /** 길이·건수만 넘긴다 */
  log(event: string, data: Record<string, unknown>): void
}

export interface NaturalCommandDeps extends IntentFileDeps {
  /** 명령을 고른 Enter·보조키를 뗄 때까지 기다린다. 시간 안에 안 떼면 false(그때는 팔레트를 숨기지 않는다) */
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
}

/**
 * 단어 목록 파일을 연다: 없으면 기본 목록으로 만들고(ensure) 기본 프로그램으로 연다. 열 프로그램이 없으면 폴더에서 그 파일을
 * 골라 두고, o.notify이면 Windows 알림으로 알린다(팔레트 명령. 설정 창 탭은 false를 받아 탭 안 경고 줄로 알리므로 두 번 알리지 않는다).
 * 열었으면 true. 경로는 화면·로그에 내지 않는다(Windows 사용자 이름이 있다)
 */
export async function openIntentsFile(d: IntentFileDeps, o: { notify?: boolean } = {}): Promise<boolean> {
  const path = await d.ensure()
  const error = await d.openFile(path)
  if (error) {
    d.showInFolder(path)
    if (o.notify) d.notify(NATURAL_NOTES.openFallback)
  }
  d.log('natural.openIntents', { opened: !error })
  return !error
}

export function createNaturalCommands(d: NaturalCommandDeps): { run(id: string): Promise<boolean> } {
  const openIntents = async (): Promise<void> => {
    if (await d.waitKeysReleased()) d.hidePalette(false)
    // 팔레트는 숨었으므로 열 프로그램이 없으면 알림으로 알린다
    await openIntentsFile(d, { notify: true })
  }
  return {
    async run(id) {
      if (id !== 'cmd.open-intents') return false
      try {
        await openIntents()
      } catch (e) {
        d.log('natural.commandError', { id, error: errorText(e) })
        d.notify('처리하지 못했어요. 다시 해 보고, 계속 안 되면 앱을 다시 켜 주세요.')
      }
      return true
    }
  }
}

export interface PickDeps {
  usage: { record(id: string): Promise<void> }
  phrases: { learn(key: string, id: string): Promise<void> }
  pack(): Promise<IntentPack>
  notify(message: string): void
  log(event: string, data: Record<string, unknown>): void
}

/**
 * `palette:pick` 처리. 값을 검사하고(틀리면 무시) 사용 기록에 항목 id만 더한다. remember이면 문장을 이해해 얻은 키(없으면 건너뜀)로
 * 학습 연결을 저장한다. 입력 문장은 로그·사용 기록·알림에 남기지 않고, 로그에는 키 길이만 남긴다.
 */
export function createPickHandler(d: PickDeps): (raw: unknown) => Promise<void> {
  return async (raw) => {
    const pick = parsePick(raw)
    if (!pick) return
    try {
      await d.usage.record(pick.id)
      if (!pick.remember) return
      const key = understand(pick.query, await d.pack()).key
      if (!key) return
      await d.phrases.learn(key, pick.id)
      d.log('phrase.learn', { keyLength: key.length })
      // 문장은 알림에도 넣지 않는다(Windows 알림 기록에 남는다)
      d.notify('이 문장을 기억했어요. 다음부터 같은 문장을 입력하면 고른 항목이 맨 위에 와요.')
    } catch (e) {
      d.log('natural.pickError', { error: errorText(e) })
    }
  }
}
