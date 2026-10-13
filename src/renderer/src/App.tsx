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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSettingsOpen((open) => !open)
      }
      if (event.key === 'Escape') setSettingsOpen(false)
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
      <div className="min-h-0 flex-1">
        {initialized ? (
          <ResizableLayout />
        ) : (
          <main className="flex h-full items-center justify-center text-sm text-fg-subtle">
            正在初始化…
          </main>
        )}
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
