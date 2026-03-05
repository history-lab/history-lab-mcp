// ============================================================
// Enums / Literals
// ============================================================

export const CORPUS_IDS = [
  'frus', 'cables', 'cia', 'clinton', 'briefing',
  'cfpf', 'kissinger', 'nato', 'un', 'worldbank', 'cabinet', 'cpdoc',
] as const

export type CorpusId = (typeof CORPUS_IDS)[number]

export const CLASSIFICATIONS = [
  'top secret', 'secret', 'strictly confidential', 'confidential',
  'restricted', 'limited official use', 'unclassified', 'unknown', 'no security level',
] as const

export type Classification = (typeof CLASSIFICATIONS)[number]

export const FTS_MODES = ['plfts', 'phfts', 'wfts', 'fts'] as const
export type FtsMode = (typeof FTS_MODES)[number]

export const ENTITY_GROUPS = ['PERSON', 'LOC', 'ORG', 'OTHER'] as const
export type EntityGroup = (typeof ENTITY_GROUPS)[number]

// ============================================================
// Core Data Types
// ============================================================

export interface Document {
  docId: string
  corpus: string
  title: string
  date: string | null
  classification: string | null
  body: string | null
  source: string | null
  wordCount: number | null
  pageCount: number | null
  charCount: number | null
  language: string | null
  metadata: Record<string, unknown>
}

export interface FrusDocument extends Document {
  from: string | null
  to: string | null
  location: string | null
  chapterTitle: string | null
  subject: string | null
  volumeId: string | null
  keyContentSummary: FrusContentSummary | null
}

export interface FrusContentSummary {
  primaryCorrespondence: string | null
  secondaryDocument: string | null
  dateRange: string | null
  mainThemes: string[] | null
  keyQuote: string | null
}

export interface EnrichedDocument extends Document {
  topicNames: string[]
  topicScores: number[]
  entities: string[]
  entityGroups: string[]
  wikidataIds: string[]
}

export interface Chunk {
  text: string
  score: number
}

// ============================================================
// Search Types
// ============================================================

export interface VectorSearchOptions {
  query: string | string[]
  limit?: number
  dateFrom?: string
  dateTo?: string
}

export interface VectorSearchResult {
  documentId: string
  bestScore: number
  chunks: Chunk[]
  fileInfo: VectorFileInfo
}

export interface VectorFileInfo {
  id: string
  name: string
  size: number
  r2Key: string
  metadata: Record<string, unknown>
}

export interface CorpusSearchOptions {
  query?: string
  titleQuery?: string
  corpus?: CorpusId | CorpusId[]
  classification?: Classification | Classification[]
  dateFrom?: string
  dateTo?: string
  docLanguage?: string
  ftsMode?: FtsMode
  limit?: number
  offset?: number
  orderBy?: 'authored' | 'word_cnt' | 'doc_id'
  orderDir?: 'asc' | 'desc'
  includeBody?: boolean
  select?: string[]
}

export interface FrusSearchOptions extends CorpusSearchOptions {
  from?: string
  to?: string
  location?: string
  volumeId?: string
}

export interface EntitySearchOptions {
  query: string
  group?: EntityGroup
  limit?: number
  orderBy?: 'doc_cnt' | 'entity'
}

export interface CorpusSearchResult {
  documents: Document[]
  totalCount: number | null
}

export interface FrusSearchResult {
  documents: FrusDocument[]
  totalCount: number | null
}

// ============================================================
// Browse / Reference Types
// ============================================================

export interface Corpus {
  id: string
  title: string
  beginDate: string | null
  endDate: string | null
  docCount: number
  pageCount: number | null
  wordCount: number
  topicCount: number
  dayCount: number
  monthCount: number
  yearCount: number
  aggDateType: string
  aggDateFormat: string
}

export interface Entity {
  entityId: number
  name: string
  group: EntityGroup
  wikidataId: string | null
  docCount: number
}

export interface Topic {
  corpus: string
  topicId: number
  title: string
  name: string | null
}

export interface TopicDoc {
  corpus: string
  topicId: number
  docId: string
  score: number
}

export interface ClassificationInfo {
  name: string
  sensitivityLevel: number
}

export interface Totals {
  docs: number
  pages: number
  words: number
}

export interface DecadeStats {
  decade: string
  docs: number
  pages: number
  words: number
}

// ============================================================
// Pagination
// ============================================================

export interface PaginationOptions {
  limit?: number
  offset?: number
}

// ============================================================
// Errors
// ============================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public endpoint: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class AuthError extends ApiError {
  constructor(message: string, endpoint: string) {
    super(message, 401, endpoint)
    this.name = 'AuthError'
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string, endpoint: string) {
    super(message, 404, endpoint)
    this.name = 'NotFoundError'
  }
}
