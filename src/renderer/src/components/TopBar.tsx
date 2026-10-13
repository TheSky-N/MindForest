import { useAppStore } from '../stores/appStore'

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const info = useAppStore((state) => state.info)
  const error = useAppStore((state) => state.error)
  const clearError = useAppStore((state) => state.clearError)
  const activeProfile = useAppStore((state) => state.profiles.find((profile) => profile.isActive))

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-2">
      <span className="text-sm font-semibold tracking-wide text-emerald-400">MindForest</span>
      <span className="text-xs text-slate-500">v{info?.version ?? '0.0.0'}</span>
      <button
        type="button"
        onClick={onOpenSettings}
        className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
      >
        模型设置
      </button>
      <span className="hidden max-w-56 truncate text-[11px] text-slate-500 md:inline">
        {activeProfile ? `${activeProfile.name} · ${activeProfile.model}` : '未启用模型'}
      </span>
      <div className="flex-1" />
      {info && !info.secureStorageAvailable && (
        <span
          className="rounded bg-amber-900/50 px-2 py-0.5 text-[11px] text-amber-300"
          title="检测到系统密钥环不可用，API Key 将只能以会话模式保存"
        >
          系统密钥环不可用
        </span>
      )}
      {error && (
        <button
          type="button"
          onClick={clearError}
          title={error}
          className="max-w-[45%] truncate rounded bg-rose-900/60 px-2 py-0.5 text-[11px] text-rose-200 hover:bg-rose-900"
        >
          {error}
        </button>
      )}
    </header>
  )
}
