import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { errorCode, errorText } from '../error-text'
import { saveSettings, SETTINGS_FILE, SettingsUnreadableError, updateSettings, type Settings } from './settings-store'

/** 설정 파일을 읽지 못해 저장하지 않았을 때 알림(문제가 이어지는 동안 한 번) */
export const SETTINGS_UNREADABLE_NOTICE = '설정 파일(settings.json)을 읽지 못해 바꾼 설정을 저장하지 않았어요. 이번 실행에만 적용돼요.'

export interface SettingsWriterDeps {
  /** 설정 폴더(사용자 데이터 폴더) */
  dir(): string
  /** 지금 적용한 설정 */
  current(): Settings
  /** 바뀐 설정을 적용한다(트레이·바 갱신) */
  apply(next: Settings): void
  notify(message: string): void
  /** 오류는 코드만 넘긴다(경로·내용 금지) */
  log(event: string, data: Record<string, unknown>): void
}

export interface SettingsWriter {
  /** 설정 파일을 다시 읽어 바꿀 값만 고친 뒤 저장하고 적용한다. 저장하지 못해도 이번 실행에는 적용한다 */
  change(update: (current: Settings) => Settings): Promise<void>
  /** 말랑 메이트 보이기·숨기기를 뒤집고, 적용한 값을 돌려준다 */
  togglePet(): Promise<boolean>
  /** 설정 파일이 없으면(ENOENT) 지금 설정으로 만든다. 만들었으면 true */
  ensureFile(): Promise<boolean>
}

/**
 * 실행 중 설정 저장. 한 번에 하나씩 차례로 실행한다(겹치면 한쪽 변경이 사라지고 같은 임시 파일 settings.json.tmp에 함께 쓴다).
 * 파일을 읽지 못했거나 깨졌으면 파일을 덮거나 옮기지 않고, 메모리의 설정(사내 도메인 등)에 이번 값만 바꿔 적용한다.
 */
export function createSettingsWriter(d: SettingsWriterDeps): SettingsWriter {
  let queue: Promise<void> = Promise.resolve()
  /** 지금 이어지는 '읽지 못함'을 이미 알렸는지. 다시 저장하게 되면 다음 문제는 다시 알린다 */
  let unreadableNoticed = false

  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job)
    queue = run.then(
      () => {},
      () => {}
    )
    return run
  }

  /** 줄에서 차례가 왔을 때 실행한다. 적용한 설정을 돌려준다 */
  const write = async (update: (current: Settings) => Settings): Promise<Settings> => {
    let next: Settings
    try {
      next = await updateSettings(d.dir(), update)
      unreadableNoticed = false
    } catch (e) {
      if (e instanceof SettingsUnreadableError) {
        d.log('settings.unreadable', { what: e.what, error: errorCode(e.cause) })
        if (!unreadableNoticed) {
          unreadableNoticed = true
          d.notify(SETTINGS_UNREADABLE_NOTICE)
        }
      } else {
        d.log('settings.saveError', { error: errorText(e) })
      }
      // 기본값이 아니라 메모리의 지금 설정에 이번 값만 바꿔 적용한다
      next = update(d.current())
    }
    d.apply(next)
    return next
  }

  return {
    change: (update) =>
      enqueue(async () => {
        await write(update)
      }),
    togglePet: () =>
      enqueue(async () => {
        // 차례가 왔을 때(앞 저장이 적용된 뒤)의 상태를 뒤집는다. 빠르게 두 번 누르면 두 번 바뀐다
        const visible = !d.current().pet.visible
        const applied = (await write((cur) => ({ ...cur, pet: { ...cur.pet, visible } }))).pet.visible
        d.log('pet.visible', { visible: applied })
        return applied
      }),
    ensureFile: () =>
      enqueue(async () => {
        try {
          await access(join(d.dir(), SETTINGS_FILE))
          return false
        } catch (e) {
          // 없을 때(ENOENT)만 만든다. 권한·잠김 등으로 확인하지 못했으면 있는 파일을 덮어쓰지 않는다
          if ((e as NodeJS.ErrnoException | null)?.code !== 'ENOENT') return false
        }
        await saveSettings(d.dir(), d.current())
        return true
      })
  }
}
