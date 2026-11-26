import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Mantine 스타일은 앱 CSS보다 먼저 불러온다 — 배치를 정하는 앱 CSS가 뒤에서 이긴다(App.jsx가 App.css·workspace.css를 부른다).
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import MantineRoot from './ui/MantineRoot.jsx'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineRoot>
      <App />
    </MantineRoot>
  </StrictMode>,
)
