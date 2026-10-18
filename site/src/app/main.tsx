import { createRoot } from 'react-dom/client'

import { i18n, syncDocumentMeta } from '@/shared/config'
import { applyTheme, getInitialTheme } from '@/shared/lib/theme'

import { App } from './App'

// Единственный css (канон kubica): unplugin инжектит собранный stylex в первый
// css-ассет — импорт обязателен.
import './styles/global.css'

// Тема и язык — до первого рендера (мета-теги в index.html — EN-дефолт,
// после монтирования App синхронизируются под выбранный язык).
applyTheme(getInitialTheme())
syncDocumentMeta()
i18n.on('languageChanged', syncDocumentMeta)

createRoot(document.getElementById('root')!).render(<App />)
