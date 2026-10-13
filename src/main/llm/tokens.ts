import { encode } from 'gpt-tokenizer'

const CJK_PATTERN =
  /[\u1100-\u11ff\u2e80-\u2eff\u3000-\u303f\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/u

export function fallbackCountTokens(text: string): number {
  const chars = Array.from(text)
  let cjk = 0
  for (const char of chars) {
    if (CJK_PATTERN.test(char)) cjk += 1
  }
  return cjk + Math.ceil((chars.length - cjk) / 4)
}

export function countTokens(text: string): number {
  if (!text) return 0
  try {
    return encode(text).length
  } catch {
    return fallbackCountTokens(text)
  }
}
