export const SUMMARY_REBUILD_MIN_NEW_MESSAGES = 3
export const SUMMARY_REBUILD_MIN_NEW_TOKENS = 800

export interface SummaryBaseline {
  summarizedMessageCount: number
  summarizedTokenCount: number
}

export function shouldRebuildSummary(
  baseline: SummaryBaseline | null | undefined,
  currentMessageCount: number,
  currentTokenCount: number
): boolean {
  if (!baseline) return currentMessageCount > 0
  if (currentMessageCount - baseline.summarizedMessageCount >= SUMMARY_REBUILD_MIN_NEW_MESSAGES) {
    return true
  }
  return currentTokenCount - baseline.summarizedTokenCount >= SUMMARY_REBUILD_MIN_NEW_TOKENS
}
