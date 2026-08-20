import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import App from './App'
import { applyPalette, getStoredPalette } from './features/theme/palette'
import './styles.css'

applyPalette(getStoredPalette())

const root = document.getElementById('root')

if (!root) {
  throw new Error('No se encontró el contenedor raíz de SOLOG.')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
