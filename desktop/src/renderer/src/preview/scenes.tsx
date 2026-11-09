import { StatusBar } from '../palette/StatusBar'
import { Desktop } from './Desktop'
import type { FakeFixtures } from './fake-api'

export interface Scene {
  id: string
  title: string
  fixtures: Partial<FakeFixtures>
  render(): React.JSX.Element
}

export const SCENES: Scene[] = [
  {
    id: 'status-bar',
    title: '팔레트 아래 상태 줄(가명 처리 끔)',
    fixtures: { status: { paletteHotkey: 'Alt+`', maskingMode: 'off', aiTargetName: 'Claude' } },
    render: () => (
      <Desktop edge="left">
        <div style={{ width: 600, marginLeft: 20, background: 'var(--surface-palette-solid)', borderRadius: 8 }}>
          <StatusBar refreshKey={0} />
        </div>
      </Desktop>
    )
  }
]
