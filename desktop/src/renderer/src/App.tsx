import { Bar } from './bar/Bar'
import { Flyout } from './flyout/Flyout'
import { ImeLogger } from './ime-logger/ImeLogger'
import { Palette } from './palette/Palette'
import { Pet } from './pet/Pet'

/** 창마다 같은 번들을 불러오고 주소의 # 경로로 화면을 고른다 */
function App(): React.JSX.Element {
  switch (window.location.hash) {
    case '#/ime-logger':
      return <ImeLogger />
    case '#/bar':
      return <Bar />
    case '#/flyout':
      return <Flyout />
    case '#/pet':
      return <Pet />
    default:
      return <Palette />
  }
}

export default App
