import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reportPwaStandaloneStatus } from './lib/pwaDiagnostics'

// 화면에는 아무 영향 없음 — 콘솔 로그 + <html> data 속성만 남기는 진단.
reportPwaStandaloneStatus()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
