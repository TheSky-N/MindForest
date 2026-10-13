import { useEffect, useState } from 'react'
import type { LlmProfileInput, LlmProfileTestResult } from '@shared/types'
import { useAppStore } from '../stores/appStore'

const EMPTY_DRAFT: LlmProfileInput = {
  name: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  temperature: 0.7
}

const inputClass =
  'w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs outline-none focus:border-emerald-600'

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    if (!open) return
    let cancelled = false
    void loadProfiles().then(() => {
      if (cancelled) return
      const list = useAppStore.getState().profiles
      const target = list.find((profile) => profile.isActive) ?? list[0]
      setSelectedId(target ? target.id : null)
      setDraft(
        target
          ? {
              name: target.name,
              baseUrl: target.baseUrl,
              model: target.model,
              temperature: target.temperature
            }
          : EMPTY_DRAFT
      )
      setApiKeyInput('')
      setApiKeyDirty(false)
      setTestResult(null)
    })
    return () => {
      cancelled = true
    }
  }, [open, loadProfiles])

  useEffect(() => {
    if (!open || !selectedId) return
    const selected = profiles.find((profile) => profile.id === selectedId)
    if (!selected) return
    setDraft({
      name: selected.name,
      baseUrl: selected.baseUrl,
      model: selected.model,
      temperature: selected.temperature
    })
  }, [open, selectedId, profiles])

  if (!open) return null

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-[760px] max-w-full flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-200">模型设置（Ctrl+K）</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            关闭
          </button>
        </div>

        {info && !info.secureStorageAvailable && (
          <div className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-2 text-[11px] text-amber-300">
            系统密钥环不可用：API Key 只会保留在本次会话中，重启应用后需要重新输入。
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="flex w-52 shrink-0 flex-col border-r border-slate-800 p-3">
            <button
              type="button"
              onClick={handleNew}
              className="mb-2 rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600"
            >
              新建配置
            </button>
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {profiles.map((profile) => {
                const isSelected = profile.id === selectedId
                return (
                  <li key={profile.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(profile.id)}
                      className={`w-full rounded px-2 py-1.5 text-left text-xs ${
                        isSelected
                          ? 'bg-slate-700/70 text-slate-100'
                          : 'text-slate-300 hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        {profile.isActive && (
                          <span className="rounded bg-emerald-900/70 px-1 text-[10px] text-emerald-300">
                            启用
                          </span>
                        )}
                        <span className="truncate">{profile.name}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                        {profile.model}
                      </span>
                    </button>
                  </li>
                )
              })}
              {profiles.length === 0 && (
                <li className="px-1 text-[11px] text-slate-600">还没有配置</li>
              )}
            </ul>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-400">名称</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="例如 DeepSeek"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-400">模型</span>
                <input
                  value={draft.model}
                  onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                  placeholder="例如 deepseek-chat"
                  className={inputClass}
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-[11px] text-slate-400">
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
                <span className="text-[11px] text-slate-400">温度</span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={draft.temperature ?? 0.7}
                  onChange={(event) =>
                    setDraft({ ...draft, temperature: Number(event.target.value) })
                  }
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-400">API Key</span>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(event) => {
                    setApiKeyInput(event.target.value)
                    setApiKeyDirty(true)
                  }}
                  placeholder={
                    selected?.hasApiKey ? '已保存，留空保持不变' : '输入 API Key（可留空）'
                  }
                  className={inputClass}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-600"
              >
                {selectedId ? '保存修改' : '创建配置'}
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={!selectedId || testing}
                className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200 enabled:hover:bg-slate-800 disabled:opacity-40"
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
              {selected && !selected.isActive && (
                <button
                  type="button"
                  onClick={() => void setActiveProfile(selected.id)}
                  className="rounded border border-emerald-700 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950"
                >
                  设为当前使用
                </button>
              )}
              {selected && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`删除配置「${selected.name}」？`)) {
                      void removeProfile(selected.id).then(() => {
                        setSelectedId(null)
                        setTestResult(null)
                      })
                    }
                  }}
                  className="ml-auto rounded px-2 py-1.5 text-xs text-slate-500 hover:bg-rose-950 hover:text-rose-300"
                >
                  删除配置
                </button>
              )}
            </div>

            {testResult && (
              <p
                className={`mt-3 text-xs ${testResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}
              >
                {testResult.ok
                  ? `连接成功：${testResult.reply ?? ''}`
                  : `连接失败：${testResult.error ?? '未知错误'}`}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
