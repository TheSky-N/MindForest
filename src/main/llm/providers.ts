import type { LlmProviderId, ReasoningEffort } from '@shared/types'

export interface ProviderRuntimeOptions {
  provider?: LlmProviderId
  reasoningEffort?: ReasoningEffort | null
}

export function providerExtraBody(options: ProviderRuntimeOptions): Record<string, unknown> {
  const effort = options.reasoningEffort
  if (!effort || effort === 'none') return {}
  switch (options.provider) {
    case 'openai':
      return { reasoning_effort: effort }
    case 'openrouter':
      return { reasoning: { effort } }
    case 'qwen':
      return { enable_thinking: true }
    case 'zhipu':
      return { thinking: { type: 'enabled' } }
    default:
      return {}
  }
}

export function shouldOmitTemperature(options: ProviderRuntimeOptions): boolean {
  return (
    options.provider === 'openai' &&
    Boolean(options.reasoningEffort && options.reasoningEffort !== 'none')
  )
}

export function providerHeaders(provider?: LlmProviderId): Record<string, string> {
  if (provider === 'openrouter') {
    return { 'HTTP-Referer': 'https://github.com/TheSky-N/MindForest', 'X-Title': 'MindForest' }
  }
  return {}
}
