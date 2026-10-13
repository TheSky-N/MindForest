import { useState } from 'react'
import { useAppStore } from '../stores/appStore'

export function Sidebar() {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const createProject = useAppStore((state) => state.createProject)
  const selectProject = useAppStore((state) => state.selectProject)
  const deleteProject = useAppStore((state) => state.deleteProject)
  const [name, setName] = useState('')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setName('')
    void createProject(trimmed)
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900/40">
      <section className="flex min-h-0 flex-1 flex-col border-b border-slate-800 p-3">
        <h2 className="mb-2 text-xs font-medium text-slate-400">项目</h2>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
            placeholder="新项目名称"
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs outline-none focus:border-emerald-600"
          />
          <button
            type="button"
            onClick={submit}
            className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600"
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
                    active
                      ? 'bg-emerald-900/50 text-emerald-200'
                      : 'text-slate-300 hover:bg-slate-800/70'
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
                  className="hidden rounded px-1 text-slate-600 hover:text-rose-400 group-hover:block"
                >
                  ✕
                </button>
              </li>
            )
          })}
          {projects.length === 0 && (
            <li className="px-1 text-[11px] text-slate-600">还没有项目，创建一个开始探索</li>
          )}
        </ul>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
          提示：右侧卡片树展示主题的层级结构，点击节点即可切换卡片。
        </p>
      </section>
    </aside>
  )
}
