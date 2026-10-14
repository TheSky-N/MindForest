import { useState } from 'react'
import { PanelLeftClose, Pencil } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { CardShell } from './layout/CardShell'
import { TreeRenameDialog } from './tree/TreeRenameDialog'

export function Sidebar() {
  const projects = useAppStore((state) => state.projects)
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const createProject = useAppStore((state) => state.createProject)
  const openProjectTab = useAppStore((state) => state.openProjectTab)
  const deleteProject = useAppStore((state) => state.deleteProject)
  const renameProject = useAppStore((state) => state.renameProject)
  const togglePanel = useAppStore((state) => state.togglePanel)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)

  const activeProjectId = tabs.find((tab) => tab.id === activeTabId)?.projectId ?? null

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
                  onClick={() => void openProjectTab(project.id)}
                  className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs ${
                    active ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-card-muted'
                  }`}
                >
                  {project.name}
                </button>
                <button
                  type="button"
                  title="重命名项目"
                  onClick={() => setRenaming({ id: project.id, value: project.name })}
                  className="hidden rounded px-1 text-fg-subtle hover:text-accent group-hover:block"
                >
                  <Pencil className="h-3 w-3" />
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
          提示：右侧主题对话树中，单击预览、双击进入并继续；每发送一条消息都会创建一个子节点。
        </p>
      </div>

      {renaming && (
        <TreeRenameDialog
          heading="重命名项目"
          value={renaming.value}
          onChange={(value) => setRenaming({ id: renaming.id, value })}
          onCancel={() => setRenaming(null)}
          onConfirm={() => {
            const trimmed = renaming.value.trim()
            if (trimmed) void renameProject(renaming.id, trimmed)
            setRenaming(null)
          }}
        />
      )}
    </CardShell>
  )
}
