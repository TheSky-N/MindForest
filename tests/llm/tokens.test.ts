import { describe, expect, it } from 'vitest'
import { countTokens, fallbackCountTokens } from '@main/llm/tokens'

describe('token 计数', () => {
  it('英文句子计数在合理范围', () => {
    const count = countTokens('Hello, MindForest!')
    expect(count).toBeGreaterThan(2)
    expect(count).toBeLessThan(10)
  })

  it('中文不会被按四字一 token 低估', () => {
    const count = countTokens('你好世界')
    expect(count).toBeGreaterThanOrEqual(2)
    expect(count).toBeLessThanOrEqual(10)
  })

  it('空字符串为 0', () => {
    expect(countTokens('')).toBe(0)
  })

  it('回退算法按 CJK 单字计数、拉丁四字符近似', () => {
    expect(fallbackCountTokens('你好')).toBe(2)
    expect(fallbackCountTokens('abcd')).toBe(1)
    expect(fallbackCountTokens('你好ab')).toBe(3)
    expect(fallbackCountTokens('')).toBe(0)
  })
})
