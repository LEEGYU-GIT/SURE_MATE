import '../design/tokens.css'
import '../assets/tailwind.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PreviewApp } from './PreviewApp'

document.body.style.overflow = 'auto'
document.documentElement.style.background = '#000'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>
)
