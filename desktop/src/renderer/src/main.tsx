import './design/tokens.css'
import './assets/tailwind.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { preventFileDrop } from './drop-guard'

preventFileDrop(window)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
