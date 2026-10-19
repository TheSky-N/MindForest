import { sql, type SQL } from 'drizzle-orm'
import type { SearchResult } from '@shared/types'
import type { AppDatabase } from '../client'

const MAX_QUERY_LENGTH = 80
const MAX_RESULTS = 40

interface SearchRow {
  nodeId: string
  projectId: string
  projectName: string
  title: string | null
  userContent: string
  assistantContent: string
  createdAt: number | Date
}

export interface SearchInput {
  query: string
  projectId?: string
  limit?: number
}

function cleanQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH)
}

function buildSnippet(
  text: string,
  query: string
): { snippet: string; start: number; length: number } {
  const source = text.replace(/\s+/g, ' ').trim()
  if (!source) return { snippet: '', start: 0, length: 0 }
  const index = source.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) {
    const snippet = source.slice(0, 140)
    return { snippet, start: 0, length: 0 }
  }
  const from = Math.max(0, index - 48)
  const to = Math.min(source.length, index + query.length + 88)
  const prefix = from > 0 ? '…' : ''
  const suffix = to < source.length ? '…' : ''
  const snippet = `${prefix}${source.slice(from, to)}${suffix}`
  return {
    snippet,
    start: prefix.length + (index - from),
    length: query.length
  }
}

function toResult(row: SearchRow, query: string): SearchResult {
  const title = row.title?.trim() ?? ''
  const user = row.userContent ?? ''
  const assistant = row.assistantContent ?? ''
  const lower = query.toLowerCase()
  const matchedField: SearchResult['matchedField'] = title.toLowerCase().includes(lower)
    ? 'title'
    : user.toLowerCase().includes(lower)
      ? 'user'
      : 'assistant'
  const source = matchedField === 'title' ? title : matchedField === 'user' ? user : assistant
  const snippet = buildSnippet(source, query)
  return {
    nodeId: row.nodeId,
    projectId: row.projectId,
    projectName: row.projectName,
    title: row.title,
    matchedField,
    snippet: snippet.snippet,
    matchStart: snippet.start,
    matchLength: snippet.length,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
  }
}

export function createSearchRepository(db: AppDatabase) {
  return {
    query(input: SearchInput): SearchResult[] {
      const query = cleanQuery(input.query)
      if (!query) return []
      const limit = Math.min(Math.max(input.limit ?? 20, 1), MAX_RESULTS)
      const projectClause: SQL = input.projectId
        ? sql`AND n.project_id = ${input.projectId}`
        : sql``

      // FTS5 trigram needs at least 3 characters; short queries fall back to LIKE.
      if (query.length >= 3) {
        const tokens = query.split(' ').filter(Boolean).slice(0, 6)
        if (tokens.every((token) => token.length >= 3)) {
          const ftsQuery = tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' AND ')
          try {
            const rows = db.all<SearchRow>(sql`
              SELECT n.id AS nodeId, n.project_id AS projectId, p.name AS projectName,
                     n.title AS title, n.user_content AS userContent,
                     n.assistant_content AS assistantContent, n.created_at AS createdAt
              FROM nodes_fts f
              JOIN nodes n ON n.rowid = f.rowid
              JOIN projects p ON p.id = n.project_id
              WHERE nodes_fts MATCH ${ftsQuery} AND n.deleted_at IS NULL ${projectClause}
              ORDER BY bm25(nodes_fts)
              LIMIT ${limit}
            `)
            if (rows.length > 0) return rows.map((row) => toResult(row, query))
          } catch {
            // Fall through to LIKE if the FTS index is unavailable or the query is malformed.
          }
        }
      }

      const like = `%${query}%`
      const rows = db.all<SearchRow>(sql`
        SELECT n.id AS nodeId, n.project_id AS projectId, p.name AS projectName,
               n.title AS title, n.user_content AS userContent,
               n.assistant_content AS assistantContent, n.created_at AS createdAt
        FROM nodes n
        JOIN projects p ON p.id = n.project_id
        WHERE n.deleted_at IS NULL
          AND (n.title LIKE ${like} OR n.user_content LIKE ${like} OR n.assistant_content LIKE ${like})
          ${projectClause}
        ORDER BY n.updated_at DESC
        LIMIT ${limit}
      `)
      return rows.map((row) => toResult(row, query))
    }
  }
}

export type SearchRepository = ReturnType<typeof createSearchRepository>
