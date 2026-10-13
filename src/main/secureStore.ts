import { safeStorage } from 'electron'

export function isSecureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function encryptSecret(plain: string): string {
  if (!isSecureStorageAvailable()) {
    throw new Error('当前系统密钥环不可用，无法加密保存 API Key')
  }
  return safeStorage.encryptString(plain).toString('base64')
}

export function decryptSecret(encrypted: string): string {
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}
