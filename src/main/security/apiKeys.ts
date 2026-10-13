import { decryptSecret, encryptSecret, isSecureStorageAvailable } from '../secureStore'

const sessionKeys = new Map<string, string>()

export function storeApiKey(profileId: string, apiKey: string): string | null {
  sessionKeys.set(profileId, apiKey)
  if (!isSecureStorageAvailable()) return null
  return encryptSecret(apiKey)
}

export function clearApiKey(profileId: string): void {
  sessionKeys.delete(profileId)
}

export function hasSessionApiKey(profileId: string): boolean {
  return sessionKeys.has(profileId)
}

export function getApiKey(profileId: string, encrypted: string | null): string | null {
  const cached = sessionKeys.get(profileId)
  if (cached !== undefined) return cached
  if (!encrypted || !isSecureStorageAvailable()) return null
  try {
    const decrypted = decryptSecret(encrypted)
    sessionKeys.set(profileId, decrypted)
    return decrypted
  } catch {
    return null
  }
}
