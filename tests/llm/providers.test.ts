import { describe, expect, it } from 'vitest'
import { providerExtraBody, providerHeaders, shouldOmitTemperature } from '@main/llm/providers'

describe('Provider 适配', () => {
  it('按厂商生成推理参数', () => {
    expect(providerExtraBody({ provider: 'openai', reasoningEffort: 'medium' })).toEqual({
      reasoning_effort: 'medium'
    })
    expect(providerExtraBody({ provider: 'openrouter', reasoningEffort: 'low' })).toEqual({
      reasoning: { effort: 'low' }
    })
    expect(providerExtraBody({ provider: 'qwen', reasoningEffort: 'high' })).toEqual({
      enable_thinking: true
    })
    expect(providerExtraBody({ provider: 'zhipu', reasoningEffort: 'low' })).toEqual({
      thinking: { type: 'enabled' }
    })
    expect(providerExtraBody({ provider: 'deepseek', reasoningEffort: 'high' })).toEqual({})
    expect(providerExtraBody({ provider: 'custom', reasoningEffort: 'none' })).toEqual({})
  })

  it('OpenAI 推理模型省略 temperature', () => {
    expect(shouldOmitTemperature({ provider: 'openai', reasoningEffort: 'medium' })).toBe(true)
    expect(shouldOmitTemperature({ provider: 'openai', reasoningEffort: null })).toBe(false)
    expect(shouldOmitTemperature({ provider: 'deepseek', reasoningEffort: 'medium' })).toBe(false)
  })

  it('OpenRouter 带来源标识', () => {
    expect(providerHeaders('openrouter')['X-Title']).toBe('MindForest')
    expect(providerHeaders('deepseek')).toEqual({})
  })
})
