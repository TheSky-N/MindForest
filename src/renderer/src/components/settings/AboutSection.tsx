import { useAppStore } from '../../stores/appStore'

export function AboutSection() {
  const info = useAppStore((state) => state.info)

  return (
    <div className="flex flex-col gap-3 text-xs leading-relaxed text-fg-muted">
      <h3 className="text-xs font-medium text-fg">关于 MindForest</h3>
      <p>
        版本 v{info?.version ?? '0.0.0'} · 平台 {info?.platform ?? ''}
      </p>
      <p>将 AI 对话组织成主题卡片树，让思想自然生长。</p>
      <a
        href="https://github.com/TheSky-N/MindForest"
        target="_blank"
        rel="noreferrer"
        className="text-accent hover:underline"
      >
        github.com/TheSky-N/MindForest
      </a>
      <p>License: MIT</p>
    </div>
  )
}
