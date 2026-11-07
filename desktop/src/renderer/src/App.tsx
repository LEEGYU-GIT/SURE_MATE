import { ImeLogger } from './ime-logger/ImeLogger'
import { Palette } from './palette/Palette'

function App(): React.JSX.Element {
  return window.location.hash === '#/ime-logger' ? <ImeLogger /> : <Palette />
}

export default App
