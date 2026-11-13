import type { PaletteItem } from '../../shared/types'

/**
 * 팔레트에서 설정 창을 여는 명령(트레이·바 설정 단추와 같은 창)과, 같은 창에 뜨는 30초 따라 해 보기(2026-11-12 첫 실행 안내에서 뺐다).
 * 따라 해 보기의 부제에는 '회의록'을 쓰지 않는다: 회의록 정리 프롬프트를 찾는 검색의 맨 위를 가져가지 않게
 */
export function settingsCommandItems(): PaletteItem[] {
  return [
    {
      id: 'cmd.open-settings',
      group: 'command',
      title: '설정 열기',
      subtitle: '단축키·AI·프롬프트·가명 처리·용어 사전·바를 바꿔요',
      keywords: ['설정', 'settings', '환경설정', '옵션', 'preferences']
    },
    {
      id: 'cmd.open-try',
      group: 'command',
      title: '따라 해 보기 (30초)',
      subtitle: '예시 메모로 AI에 보낼 글 만들기를 직접 해 봐요',
      keywords: ['튜토리얼', '연습', '사용법', '따라 하기', '도움말', '익히기', 'tutorial', 'help']
    }
  ]
}

export interface SettingsCommandDeps {
  /** 명령을 고른 Enter·보조키를 뗄 때까지 기다린다. 시간 안에 안 떼면 false */
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  openSettings(): void
  /** 30초 따라 해 보기 화면(설정 창의 #/try) */
  openTry(): void
  log(event: string, data: Record<string, unknown>): void
}

export function createSettingsCommands(d: SettingsCommandDeps): {
  run(id: string): Promise<boolean>
} {
  const commands = new Map<string, { open(): void; event: string }>([
    ['cmd.open-settings', { open: () => d.openSettings(), event: 'settings.openCommand' }],
    ['cmd.open-try', { open: () => d.openTry(), event: 'try.openCommand' }]
  ])
  return {
    async run(id) {
      const command = commands.get(id)
      if (!command) return false
      // 누른 채로 숨기면 자동 반복 Enter가 다른 창으로 가므로, 뗀 것을 확인했을 때만 숨긴다.
      // 설정 창이 포커스를 가져가므로 원래 창으로 돌아가지 않는다
      if (await d.waitKeysReleased()) d.hidePalette(false)
      command.open()
      d.log(command.event, {})
      return true
    }
  }
}
