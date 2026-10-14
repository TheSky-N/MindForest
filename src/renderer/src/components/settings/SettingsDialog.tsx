import { useState } from 'react'
import { Database, Info, MessagesSquare, Palette, Server } from 'lucide-react'
import { AppearanceSection } from './AppearanceSection'
import { ChatSection } from './ChatSection'
import { ModelsSection } from './ModelsSection'
import { DataSection } from './DataSection'
import { AboutSection } from './AboutSection'

type SectionId = 'appearance' | 'chat' | 'models' | 'data' | 'about'

const SECTIONS: Array<{ id: SectionId; label: string; icon: typeof Palette }> = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'chat', label: '对话', icon: MessagesSquare },
  { id: 'models', label: '模型', icon: Server },
  { id: 'data', label: '数据', icon: Database },
  { id: 'about', label: '关于', icon: Info }
]

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [section, setSection] = useState<SectionId>('appearance')

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[580px] max-h-[90vh] w-[880px] max-w-[95vw] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-card-muted/50 p-2">
          <h2 className="px-2 py-1.5 text-xs font-medium text-fg-subtle">设置（Ctrl+K）</h2>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                section === id ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-card-muted'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1.5 text-left text-xs text-fg-subtle hover:bg-card-muted"
          >
            关闭
          </button>
        </aside>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {section === 'appearance' && <AppearanceSection />}
          {section === 'chat' && <ChatSection />}
          {section === 'models' && <ModelsSection />}
          {section === 'data' && <DataSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}
