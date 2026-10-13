import { describe, expect, it } from 'vitest'
import { shouldRebuildSummary } from '@main/llm/summaryPolicy'

describe('摘要重建阈值', () => {
  it('没有摘要且已有消息时需要重建', () => {
    expect(shouldRebuildSummary(null, 1, 10)).toBe(true)
    expect(shouldRebuildSummary(undefined, 0, 0)).toBe(false)
  })

  it('新增满 3 条消息触发重建', () => {
    const baseline = { summarizedMessageCount: 2, summarizedTokenCount: 100 }
    expect(shouldRebuildSummary(baseline, 4, 200)).toBe(false)
    expect(shouldRebuildSummary(baseline, 5, 200)).toBe(true)
  })

  it('新增满 800 token 触发重建', () => {
    const baseline = { summarizedMessageCount: 2, summarizedTokenCount: 100 }
    expect(shouldRebuildSummary(baseline, 3, 899)).toBe(false)
    expect(shouldRebuildSummary(baseline, 3, 900)).toBe(true)
  })
})
