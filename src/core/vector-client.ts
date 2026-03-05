import type { HistoryLabConfig } from './config.js'
import {
  ApiError, AuthError, NotFoundError,
  type VectorSearchOptions, type VectorSearchResult, type VectorFileInfo,
  type Document, type Chunk,
} from './types.js'

export class VectorClient {
  private baseUrl: string
  private apiKey: string
  private collectionId: string
  private timeoutMs: number

  constructor(private config: HistoryLabConfig) {
    this.baseUrl = config.vectorApiUrl.replace(/\/$/, '')
    this.apiKey = config.vectorApiKey
    this.collectionId = config.collectionId
    this.timeoutMs = config.requestTimeoutMs
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  async search(opts: VectorSearchOptions): Promise<VectorSearchResult[]> {
    this.requireAuth()

    const topK = Math.min(opts.limit ?? this.config.defaultTopK, 100)

    const body: Record<string, unknown> = {
      queries: opts.query,
      topK,
    }

    // Build date filters
    const filters = this.buildDateFilters(opts.dateFrom, opts.dateTo)
    if (filters) {
      body.filters = filters
    }

    const response = await this.post('/api/search', body)
    const data = response as VectorSearchResponse

    if (data.status === 'error') {
      throw new ApiError(data.message ?? 'Vector search failed', 500, '/api/search')
    }

    return (data.documents ?? []).map(normalizeVectorResult)
  }

  async getDocument(r2Key: string): Promise<Document> {
    this.requireAuth()

    const response = await this.get(`/api/document/${r2Key}`)
    const data = response as VectorDocResponse

    if (data.status === 'error') {
      throw new NotFoundError(data.message ?? `Document not found: ${r2Key}`, '/api/document')
    }

    return normalizeVectorDocument(data.document)
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  // ==========================================
  // INTERNAL
  // ==========================================

  private requireAuth(): void {
    if (!this.apiKey) {
      throw new AuthError(
        'Vector search requires an API key. Set HISTORYLAB_VECTOR_API_KEY.',
        this.baseUrl,
      )
    }
  }

  private buildDateFilters(
    dateFrom?: string,
    dateTo?: string,
  ): Record<string, unknown> | null {
    if (!dateFrom && !dateTo) return null

    // Determine if we should use day-level or month-level precision
    const useDays = (dateFrom && dateFrom.length > 7) || (dateTo && dateTo.length > 7)
    const filterKey = useDays ? 'authored_year_month_day' : 'authored_year_month'

    const filter: Record<string, number> = {}

    if (dateFrom) {
      filter['$gte'] = useDays ? parseDateToYMD(dateFrom) : parseDateToYM(dateFrom)
    }
    if (dateTo) {
      filter['$lte'] = useDays ? parseDateToYMD(dateTo) : parseDateToYM(dateTo)
    }

    return { [filterKey]: filter }
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (response.status === 401) {
      throw new AuthError('Invalid API key', path)
    }
    if (!response.ok) {
      const text = await response.text()
      throw new ApiError(`Vector API error: ${text}`, response.status, path)
    }

    return response.json()
  }

  private async get(path: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (response.status === 401) {
      throw new AuthError('Invalid API key', path)
    }
    if (response.status === 404) {
      throw new NotFoundError('Document not found', path)
    }
    if (!response.ok) {
      const text = await response.text()
      throw new ApiError(`Vector API error: ${text}`, response.status, path)
    }

    return response.json()
  }
}

// ============================================================
// Date conversion helpers
// ============================================================

/** "1962-10" → 196210, "1962" → 196201, "1962-10-16" → 196210 */
function parseDateToYM(date: string): number {
  const parts = date.split('-')
  const year = parts[0]
  const month = parts[1] ?? '01'
  return parseInt(`${year}${month.padStart(2, '0')}`, 10)
}

/** "1962-10-16" → 19621016, "1962-10" → 19621001, "1962" → 19620101 */
function parseDateToYMD(date: string): number {
  const parts = date.split('-')
  const year = parts[0]
  const month = parts[1] ?? '01'
  const day = parts[2] ?? '01'
  return parseInt(`${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`, 10)
}

// ============================================================
// Raw API response types
// ============================================================

interface VectorSearchResponse {
  status: string
  message?: string
  documents?: RawVectorDoc[]
  total_chunks?: number
}

interface RawVectorDoc {
  document_id: string
  best_score: number
  chunks: RawVectorChunk[]
  file_info: RawVectorFileInfo
}

interface RawVectorChunk {
  id: string
  text: string
  score: number
  metadata: Record<string, unknown>
}

interface RawVectorFileInfo {
  id: string
  name: string
  size: number
  type: string
  r2Key?: string
  metadata?: {
    doc_id?: string
    corpus?: string
    classification?: string
    title?: string
    date?: string
    source?: string
  }
}

interface VectorDocResponse {
  status: string
  message?: string
  document: {
    r2Key: string
    text: string
    metadata: Record<string, unknown>
    file_info: RawVectorFileInfo
  }
}

// ============================================================
// Normalizers
// ============================================================

function normalizeVectorResult(raw: RawVectorDoc): VectorSearchResult {
  return {
    documentId: raw.document_id,
    bestScore: raw.best_score,
    chunks: raw.chunks.map((c): Chunk => ({
      text: c.text,
      score: c.score,
    })),
    fileInfo: {
      id: raw.file_info.id,
      name: raw.file_info.name,
      size: raw.file_info.size,
      r2Key: raw.file_info.r2Key ?? '',
      metadata: raw.file_info.metadata ?? {},
    },
  }
}

function normalizeVectorDocument(raw: VectorDocResponse['document']): Document {
  const meta = raw.metadata as Record<string, string | null | undefined>
  return {
    docId: (meta.doc_id as string) ?? raw.file_info.id,
    corpus: (meta.corpus as string) ?? 'unknown',
    title: (meta.title as string) ?? raw.file_info.name,
    date: (meta.date as string) ?? null,
    classification: (meta.classification as string) ?? null,
    body: raw.text,
    source: (meta.source as string) ?? null,
    wordCount: null,
    pageCount: null,
    charCount: raw.text?.length ?? null,
    language: null,
    metadata: raw.metadata,
  }
}
