import { eq } from 'drizzle-orm'
import type { LlmCapabilities, LlmProfile, LlmProviderId, ReasoningEffort } from '@shared/types'
import { DEFAULT_LLM_CAPABILITIES, normalizeLlmCapabilities } from '@shared/types'
import type { AppDatabase } from '../client'
import { llmProfiles } from '../schema'
import { newId } from '../ids'

type LlmProfileRow = typeof llmProfiles.$inferSelect

const PROVIDERS: LlmProviderId[] = [
  'deepseek',
  'openai',
  'openrouter',
  'ollama',
  'moonshot',
  'qwen',
  'zhipu',
  'custom'
]

const EFFORTS: ReasoningEffort[] = ['none', 'low', 'medium', 'high']

export function parseProvider(value: unknown): LlmProviderId {
  return typeof value === 'string' && (PROVIDERS as string[]).includes(value)
    ? (value as LlmProviderId)
    : 'custom'
}

export function parseReasoningEffort(value: unknown): ReasoningEffort | null {
  return typeof value === 'string' && (EFFORTS as string[]).includes(value)
    ? (value as ReasoningEffort)
    : null
}

function parseCapabilities(raw: string): LlmCapabilities {
  try {
    return normalizeLlmCapabilities(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_LLM_CAPABILITIES }
  }
}

function toShared(row: LlmProfileRow): LlmProfile {
  return {
    id: row.id,
    name: row.name,
    provider: parseProvider(row.provider),
    baseUrl: row.baseUrl,
    model: row.model,
    temperature: row.temperature,
    capabilities: parseCapabilities(row.capabilities),
    reasoningEffort: parseReasoningEffort(row.reasoningEffort),
    hasApiKey: Boolean(row.apiKeyEncrypted),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function createLlmProfileRepository(db: AppDatabase) {
  const repo = {
    list(): LlmProfile[] {
      return db.select().from(llmProfiles).all().map(toShared)
    },

    getRow(id: string): LlmProfileRow | undefined {
      return db.select().from(llmProfiles).where(eq(llmProfiles.id, id)).get()
    },

    getActiveRow(): LlmProfileRow | undefined {
      return db.select().from(llmProfiles).where(eq(llmProfiles.isActive, true)).get()
    },

    getEncryptedKey(id: string): string | null {
      return repo.getRow(id)?.apiKeyEncrypted ?? null
    },

    create(input: {
      name: string
      provider?: LlmProviderId
      baseUrl: string
      model: string
      temperature?: number
      capabilities?: LlmCapabilities
      reasoningEffort?: ReasoningEffort | null
      apiKeyEncrypted?: string | null
    }): LlmProfile {
      const now = new Date()
      const row: LlmProfileRow = {
        id: newId(),
        name: input.name,
        provider: input.provider ?? 'custom',
        baseUrl: input.baseUrl,
        model: input.model,
        temperature: input.temperature ?? 0.7,
        capabilities: JSON.stringify(input.capabilities ?? DEFAULT_LLM_CAPABILITIES),
        reasoningEffort: input.reasoningEffort ?? null,
        apiKeyEncrypted: input.apiKeyEncrypted ?? null,
        isActive: false,
        createdAt: now,
        updatedAt: now
      }
      db.insert(llmProfiles).values(row).run()
      const created = repo.list().find((profile) => profile.id === row.id)
      if (!created) throw new Error('创建模型配置失败')
      return created
    },

    update(
      id: string,
      patch: {
        name?: string
        provider?: LlmProviderId
        baseUrl?: string
        model?: string
        temperature?: number
        capabilities?: LlmCapabilities
        reasoningEffort?: ReasoningEffort | null
        apiKeyEncrypted?: string | null
      }
    ): LlmProfile {
      const { capabilities, ...rest } = patch
      const next: Partial<LlmProfileRow> = { ...rest, updatedAt: new Date() }
      if (capabilities !== undefined) next.capabilities = JSON.stringify(capabilities)
      db.update(llmProfiles).set(next).where(eq(llmProfiles.id, id)).run()
      const row = repo.getRow(id)
      if (!row) throw new Error('模型配置不存在')
      return toShared(row)
    },

    remove(id: string): void {
      db.delete(llmProfiles).where(eq(llmProfiles.id, id)).run()
    },

    setActive(id: string): LlmProfile {
      return db.transaction((tx) => {
        tx.update(llmProfiles).set({ isActive: false, updatedAt: new Date() }).run()
        tx.update(llmProfiles)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(llmProfiles.id, id))
          .run()
        const row = tx.select().from(llmProfiles).where(eq(llmProfiles.id, id)).get()
        if (!row) throw new Error('模型配置不存在')
        return toShared(row)
      })
    }
  }
  return repo
}

export type LlmProfileRepository = ReturnType<typeof createLlmProfileRepository>
