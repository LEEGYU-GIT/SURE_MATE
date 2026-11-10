import type { PaletteItem } from '../../shared/types'

/** 팔레트에서 설정 창을 여는 명령(트레이·바 설정 단추와 같은 창) */
export function settingsCommandItems(): PaletteItem[] {
  return [
    {
      id: 'cmd.open-settings',
      group: 'command',
      title: '설정 열기',
      subtitle: '단축키·AI·프롬프트·가명 처리·용어 사전·바를 바꿔요',
      keywords: ['설정', 'settings', '환경설정', '옵션', 'preferences']
    }
  ]
}

export interface SettingsCommandDeps {
  /** 명령을 고른 Enter·보조키를 뗄 때까지 기다린다. 시간 안에 안 떼면 false */
  waitKeysReleased(): Promise<boolean>
  hidePalette(restoreFocus: boolean): void
  openSettings(): void
  log(event: string, data: Record<string, unknown>): void
}

export function createSettingsCommands(d: SettingsCommandDeps): { run(id: string): Promise<boolean> } {
  return {
    async run(id) {
      if (id !== 'cmd.open-settings') return false
      // 누른 채로 숨기면 자동 반복 Enter가 다른 창으로 가므로, 뗀 것을 확인했을 때만 숨긴다.
      // 설정 창이 포커스를 가져가므로 원래 창으로 돌아가지 않는다
      if (await d.waitKeysReleased()) d.hidePalette(false)
      d.openSettings()
      d.log('settings.openCommand', {})
      return true
    }
  }
}
