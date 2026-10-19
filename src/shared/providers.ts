import type { LlmCapabilities, LlmProviderId, ReasoningEffort } from './types'
import { DEFAULT_LLM_CAPABILITIES } from './types'

export interface ProviderPreset {
  id: LlmProviderId
  label: string
  baseUrl: string
  model: string
  capabilities: LlmCapabilities
  reasoningEffort: ReasoningEffort | null
  note: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    capabilities: { ...DEFAULT_LLM_CAPABILITIES, reasoning: false, vision: false },
    reasoningEffort: null,
    note: '推理模型可把模型名改为 deepseek-reasoner；思考内容会自动展示。'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    capabilities: { ...DEFAULT_LLM_CAPABILITIES, reasoning: false, vision: true },
    reasoningEffort: null,
    note: 'o 系列 / GPT-5 等推理模型可开启「推理」并选择思考强度。'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    capabilities: { ...DEFAULT_LLM_CAPABILITIES, reasoning: false, vision: true },
    reasoningEffort: null,
    note: '一个 Key 访问多家模型；推理强度会以 OpenRouter reasoning 参数发送。'
  },
  {
    id: 'ollama',
    label: 'Ollama / 本地模型',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b',
    capabilities: { ...DEFAULT_LLM_CAPABILITIES, reasoning: false, vision: false },
    reasoningEffort: null,
    note: '本地无需 API Key；请先在 Ollama 中拉取模型。'
  },
  {
    id: 'moonshot',
    label: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    capabilities: {
      ...DEFAULT_LLM_CAPABILITIES,
      reasoning: false,
      vision: false,
      contextWindow: 8192
    },
    reasoningEffort: null,
    note: 'Kimi 系列模型；长文本模型请改成对应的 32k/128k 版本。'
  },
  {
    id: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    capabilities: { ...DEFAULT_LLM_CAPABILITIES, reasoning: false, vision: false },
    reasoningEffort: null,
    note: 'Qwen3 等混合思考模型会收到 enable_thinking 参数。'
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    capabilities: { ...DEFAULT_LLM_CAPABILITIES, reasoning: false, vision: false },
    reasoningEffort: null,
    note: 'GLM 推理模型会收到 thinking 参数。'
  },
  {
    id: 'custom',
    label: '自定义 OpenAI 兼容接口',
    baseUrl: '',
    model: '',
    capabilities: { ...DEFAULT_LLM_CAPABILITIES },
    reasoningEffort: null,
    note: '任何兼容 /chat/completions 的服务都可以接入。'
  }
]

export function getProviderPreset(id: string): ProviderPreset {
  return (
    PROVIDER_PRESETS.find((preset) => preset.id === id) ??
    PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1]!
  )
}
