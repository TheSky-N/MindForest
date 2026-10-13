import { useEffect, useState } from 'react'
import { useAppStore } from './stores/appStore'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { CardTreePanel } from './components/CardTreePanel'
import { SettingsPanel } from './components/SettingsPanel'

export default function App() {
  const initialize = useAppStore((state) => state.initialize)
  const initialized = useAppStore((state) => state.initialized)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    void initialize()
  }, [initialize])

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
    return () => {
      offDelta()
      offDone()
      offError()
    }
  }, [])

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-200">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        {initialized ? (
          <ChatPanel />
        ) : (
          <main className="flex flex-1 items-center justify-center text-sm text-slate-500">
            正在初始化…
          </main>
        )}
        <CardTreePanel />
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
