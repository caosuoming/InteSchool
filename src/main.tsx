import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { applyUiScale, useSettingsStore } from './stores/settings'
import { recoverFromPreloadError } from './lib/preload-recovery'

window.addEventListener('vite:preloadError', recoverFromPreloadError)

// 启动时立即应用字体版本，避免刷新闪烁
applyUiScale(useSettingsStore.getState().uiScale)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
