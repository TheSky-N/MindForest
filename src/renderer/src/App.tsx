import { useEffect, useState } from 'react'
import { useAppStore, useEffectiveMode } from './stores/appStore'
import { TopBar } from './components/TopBar'
import { ResizableLayout } from './components/layout/ResizableLayout'
import { SettingsDialog } from './components/settings/SettingsDialog'

export default function App() {
  const initialize = useAppStore((state) => state.initialize)
  const initialized = useAppStore((state) => state.initialized)
  const preferences = useAppStore((state) => state.preferences)
  const effectiveMode = useEffectiveMode()
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = preferences.themeId
    root.dataset.mode = effectiveMode
    if (preferences.fontUi) root.style.setProperty('--font-ui', preferences.fontUi)
    else root.style.removeProperty('--font-ui')
    if (preferences.fontCode) root.style.setProperty('--font-code', preferences.fontCode)
    else root.style.removeProperty('--font-code')
    root.style.fontSize = `${preferences.ui.baseFontSize}px`
    root.style.setProperty('--chat-font-size', `${preferences.ui.chatFontSize}px`)
    root.style.setProperty('--md-heading-scale', String(preferences.ui.markdownHeadingScale / 100))
    void window.mindforest.app.setZoom(preferences.ui.scale)
  }, [preferences, effectiveMode])

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => useAppStore.setState({ systemDark: query.matches })
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSettingsOpen((open) => !open)
        return
      }
      if (event.key === 'Escape') {
        setSettingsOpen(false)
        return
      }
      if (!mod) return
      const store = useAppStore.getState()
      const key = event.key.toLowerCase()
      if (key === 't') {
        event.preventDefault()
        void store.newTab()
        return
      }
      if (key === 'w') {
        event.preventDefault()
        if (store.activeTabId) void store.closeTab(store.activeTabId)
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        void store.cycleTab(event.shiftKey ? -1 : 1)
        return
      }
      if (/^[1-9]$/.test(event.key)) {
        const tab = store.tabs[Number(event.key) - 1]
        if (tab) {
          event.preventDefault()
          void store.activateTab(tab.id)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const store = useAppStore.getState
    const offDelta = window.mindforest.chat.onDelta((event) => store().applyDelta(event))
    const offDone = window.mindforest.chat.onDone((event) => store().applyChatResult(event))
    const offError = window.mindforest.chat.onError((event) => store().applyChatResult(event))
    const offCluster = window.mindforest.tree.onClusterUpdated((cluster) =>
      store().applyClusterUpdated(cluster)
    )
    return () => {
      offDelta()
      offDone()
      offError()
      offCluster()
    }
  }, [])

  return (
    <div className="flex h-screen flex-col bg-app text-fg">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          {initialized ? (
            <ResizableLayout />
          ) : (
            <main className="flex h-full items-center justify-center text-sm text-fg-subtle">
              正在初始化…
            </main>
          )}
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
