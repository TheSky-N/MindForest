import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { LlmProfileInput, LlmProfileTestResult } from '@shared/types'
import { useAppStore } from '../../stores/appStore'

const EMPTY_DRAFT: LlmProfileInput = {
  name: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  temperature: 0.7
}

const inputClass =
  'w-full rounded border border-border bg-app px-2 py-1.5 text-xs outline-none focus:border-accent'

export function ModelsSection() {
  const profiles = useAppStore((state) => state.profiles)
  const info = useAppStore((state) => state.info)
  const loadProfiles = useAppStore((state) => state.loadProfiles)
  const createProfile = useAppStore((state) => state.createProfile)
  const updateProfile = useAppStore((state) => state.updateProfile)
  const removeProfile = useAppStore((state) => state.removeProfile)
  const setActiveProfile = useAppStore((state) => state.setActiveProfile)
  const testProfile = useAppStore((state) => state.testProfile)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<LlmProfileInput>(EMPTY_DRAFT)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyDirty, setApiKeyDirty] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<LlmProfileTestResult | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadProfiles().then(() => {
      if (cancelled) return
      const list = useAppStore.getState().profiles
      if (list.length === 0) return
      const target = list.find((profile) => profile.isActive) ?? list[0]
      setSelectedId((current) => current ?? target?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [loadProfiles])

  useEffect(() => {
    if (!selectedId) return
    const selected = profiles.find((profile) => profile.id === selectedId)
    if (!selected) return
    setDraft({
      name: selected.name,
      baseUrl: selected.baseUrl,
      model: selected.model,
      temperature: selected.temperature
    })
  }, [selectedId, profiles])

  const selected = profiles.find((profile) => profile.id === selectedId) ?? null

  const handleNew = () => {
    setSelectedId(null)
    setDraft(EMPTY_DRAFT)
    setApiKeyInput('')
    setApiKeyDirty(false)
    setTestResult(null)
  }

  const handleSave = async () => {
    const payload: LlmProfileInput = {
      ...draft,
      ...(apiKeyDirty ? { apiKey: apiKeyInput } : {})
    }
    if (selectedId) {
      const updated = await updateProfile(selectedId, payload)
      if (updated) {
        setApiKeyDirty(false)
        setApiKeyInput('')
      }
    } else {
      const created = await createProfile(payload)
      if (created) {
        setSelectedId(created.id)
        setApiKeyDirty(false)
        setApiKeyInput('')
      }
    }
  }

  const handleTest = async () => {
    if (!selectedId) return
    setTesting(true)
    setTestResult(null)
    const result = await testProfile(selectedId)
    setTestResult(result)
    setTesting(false)
  }

  return (
    <div className="flex min-h-full gap-4">
      <div className="flex w-44 shrink-0 flex-col gap-1">
        <button
          type="button"
          onClick={handleNew}
          className="flex items-center justify-center gap-1 rounded bg-accent px-2 py-1 text-xs text-accent-fg hover:bg-accent-hover"
        >
          <Plus className="h-3 w-3" />
          新建配置
        </button>
        <ul className="space-y-1">
          {profiles.map((profile) => {
            const isSelected = profile.id === selectedId
            return (
              <li key={profile.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(profile.id)
                    setTestResult(null)
                  }}
                  className={`w-full rounded px-2 py-1.5 text-left text-xs ${
                    isSelected ? 'bg-card-muted text-fg' : 'text-fg-muted hover:bg-card-muted'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {profile.isActive && (
                      <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">启用</span>
                    )}
                    <span className="truncate">{profile.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-fg-subtle">
                    {profile.model}
                  </span>
                </button>
              </li>
            )
          })}
          {profiles.length === 0 && (
            <li className="px-1 text-[11px] text-fg-subtle">还没有配置</li>
          )}
        </ul>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {info && !info.secureStorageAvailable && (
          <div className="mb-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
            系统密钥环不可用：API Key 只会保留在本次会话中，重启应用后需要重新输入。
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-fg-muted">名称</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="例如 DeepSeek"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-fg-muted">模型</span>
            <input
              value={draft.model}
              onChange={(event) => setDraft({ ...draft, model: event.target.value })}
              placeholder="例如 deepseek-chat"
              className={inputClass}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] text-fg-muted">
              Base URL（OpenAI 兼容，会拼接 /chat/completions）
            </span>
            <input
              value={draft.baseUrl}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              placeholder="https://api.deepseek.com/v1"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-fg-muted">温度</span>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={draft.temperature ?? 0.7}
              onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-fg-muted">API Key</span>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(event) => {
                setApiKeyInput(event.target.value)
                setApiKeyDirty(true)
              }}
              placeholder={selected?.hasApiKey ? '已保存，留空保持不变' : '输入 API Key（可留空）'}
              className={inputClass}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-accent px-3 py-1.5 text-xs text-accent-fg hover:bg-accent-hover"
          >
            {selectedId ? '保存修改' : '创建配置'}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={!selectedId || testing}
            className="rounded border border-border-strong px-3 py-1.5 text-xs text-fg enabled:hover:bg-card-muted disabled:opacity-40"
          >
            {testing ? '测试中…' : '测试连接'}
          </button>
          {selected && !selected.isActive && (
            <button
              type="button"
              onClick={() => void setActiveProfile(selected.id)}
              className="rounded border border-accent/60 px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
            >
              设为当前使用
            </button>
          )}
          {selected && (
            <button
              type="button"
              title="删除配置"
              onClick={() => {
                if (window.confirm(`删除配置「${selected.name}」？`)) {
                  void removeProfile(selected.id).then(() => {
                    setSelectedId(null)
                    setTestResult(null)
                  })
                }
              }}
              className="ml-auto rounded p-1.5 text-fg-subtle hover:bg-danger/15 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {testResult && (
          <p className={`mt-3 text-xs ${testResult.ok ? 'text-accent' : 'text-danger'}`}>
            {testResult.ok
              ? `连接成功：${testResult.reply ?? ''}`
              : `连接失败：${testResult.error ?? '未知错误'}`}
          </p>
        )}
      </div>
    </div>
  )
}
