import { Bar } from './bar/Bar'
import { Flyout } from './flyout/Flyout'
import { ImeLogger } from './ime-logger/ImeLogger'
import { Onboarding } from './onboarding/Onboarding'
import { Palette } from './palette/Palette'
import { Pet } from './pet/Pet'
import { routeOfHash } from '../../shared/settings/settings-route'
import { SettingsApp } from './settings/SettingsApp'
import { initialTabOf } from './settings/tabs'

/** 창마다 같은 번들을 불러오고 주소의 # 경로로 화면을 고른다 */
function App(): React.JSX.Element {
  // 설정 창은 처음 열 탭을 주소에 함께 받는다('#/settings?tab=pet', 펫 메뉴 "펫 설정")
  if (routeOfHash(window.location.hash) === '/settings') return <SettingsApp initialTab={initialTabOf(window.location.hash)} />
  switch (window.location.hash) {
    case '#/ime-logger':
      return <ImeLogger />
    case '#/bar':
      return <Bar />
    case '#/flyout':
      return <Flyout />
    case '#/pet':
      return <Pet />
    case '#/onboarding':
      return <Onboarding />
    default:
      return <Palette />
  }
}

export default App
