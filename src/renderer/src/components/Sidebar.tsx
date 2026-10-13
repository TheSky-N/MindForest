import { useState } from 'react'
import { PanelLeftClose } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { CardShell } from './layout/CardShell'

export function Sidebar() {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const createProject = useAppStore((state) => state.createProject)
  const selectProject = useAppStore((state) => state.selectProject)
  const deleteProject = useAppStore((state) => state.deleteProject)
  const togglePanel = useAppStore((state) => state.togglePanel)
  const [name, setName] = useState('')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setName('')
    void createProject(trimmed)
  }

  return (
    <CardShell
      header={
        <>
          <h2 className="flex-1 text-xs font-medium text-fg-muted">项目</h2>
          <button
            type="button"
            title="折叠侧栏"
            onClick={() => togglePanel('sidebar')}
            className="rounded p-1 text-fg-subtle hover:bg-card-muted hover:text-fg"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
            placeholder="新项目名称"
            className="min-w-0 flex-1 rounded border border-border bg-app px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={submit}
            className="rounded bg-accent px-2 py-1 text-xs text-accent-fg hover:bg-accent-hover"
          >
            新建
          </button>
        </div>
        <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {projects.map((project) => {
            const active = project.id === activeProjectId
            return (
              <li key={project.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void selectProject(project.id)}
                  className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs ${
                    active ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-card-muted'
                  }`}
                >
                  {project.name}
                </button>
                <button
                  type="button"
                  title="删除项目"
                  onClick={() => {
                    if (window.confirm(`删除项目「${project.name}」及其全部卡片？`)) {
                      void deleteProject(project.id)
                    }
                  }}
                  className="hidden rounded px-1 text-fg-subtle hover:text-danger group-hover:block"
                >
                  ✕
                </button>
              </li>
            )
          })}
          {projects.length === 0 && (
            <li className="px-1 text-[11px] text-fg-subtle">还没有项目，创建一个开始探索</li>
          )}
        </ul>
        <p className="mt-3 text-[10px] leading-relaxed text-fg-subtle">
          提示：右侧卡片树展示主题的层级结构，点击节点即可切换卡片。
        </p>
      </div>
    </CardShell>
  )
}
