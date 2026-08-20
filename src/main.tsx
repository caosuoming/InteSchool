import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { applyAppearanceMode, applyUiScale, useSettingsStore } from './stores/settings'
import { recoverFromPreloadError } from './lib/preload-recovery'

window.addEventListener('vite:preloadError', recoverFromPreloadError)

// 启动时立即应用显示设置，避免刷新闪烁
const initialSettings = useSettingsStore.getState()
applyUiScale(initialSettings.uiScale)
applyAppearanceMode(initialSettings.appearanceMode)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
