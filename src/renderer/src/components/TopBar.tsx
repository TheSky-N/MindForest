import { Moon, PanelLeft, PanelRight, Settings, Sun, Trees } from 'lucide-react'
import { useAppStore, useEffectiveMode } from '../stores/appStore'

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const info = useAppStore((state) => state.info)
  const error = useAppStore((state) => state.error)
  const clearError = useAppStore((state) => state.clearError)
  const activeProfile = useAppStore((state) => state.profiles.find((profile) => profile.isActive))
  const collapsed = useAppStore((state) => state.panelsCollapsed)
  const togglePanel = useAppStore((state) => state.togglePanel)
  const setPreferences = useAppStore((state) => state.setPreferences)
  const mode = useEffectiveMode()

  return (
    <header className="mx-2 mt-2 flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 shadow-sm">
      <span className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-accent">
        <Trees className="h-4 w-4" />
        MindForest
      </span>
      <span className="text-[11px] text-fg-subtle">v{info?.version ?? '0.0.0'}</span>
      <span className="hidden max-w-56 truncate text-[11px] text-fg-muted md:inline">
        {activeProfile ? `${activeProfile.name} · ${activeProfile.model}` : '未启用模型'}
      </span>
      <div className="flex-1" />
      {info && !info.secureStorageAvailable && (
        <span className="rounded bg-warning/20 px-2 py-0.5 text-[11px] text-warning">
          系统密钥环不可用
        </span>
      )}
      {error && (
        <button
          type="button"
          onClick={clearError}
          title={error}
          className="max-w-[40%] truncate rounded bg-danger/20 px-2 py-0.5 text-[11px] text-danger hover:bg-danger/30"
        >
          {error}
        </button>
      )}
      <button
        type="button"
        title={collapsed.sidebar ? '展开侧栏' : '折叠侧栏'}
        onClick={() => togglePanel('sidebar')}
        className={`rounded-md p-1.5 hover:bg-card-muted ${
          collapsed.sidebar ? 'text-fg-subtle' : 'text-fg-muted'
        }`}
      >
        <PanelLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        title={collapsed.tree ? '展开卡片树' : '折叠卡片树'}
        onClick={() => togglePanel('tree')}
        className={`rounded-md p-1.5 hover:bg-card-muted ${
          collapsed.tree ? 'text-fg-subtle' : 'text-fg-muted'
        }`}
      >
        <PanelRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        title={mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
        onClick={() => void setPreferences({ mode: mode === 'dark' ? 'light' : 'dark' })}
        className="rounded-md p-1.5 text-fg-muted hover:bg-card-muted"
      >
        {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <button
        type="button"
        title="设置（Ctrl+K）"
        onClick={onOpenSettings}
        className="rounded-md p-1.5 text-fg-muted hover:bg-card-muted"
      >
        <Settings className="h-4 w-4" />
      </button>
    </header>
  )
}
