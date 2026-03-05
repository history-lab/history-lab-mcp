import type { HistoryLabConfig } from './config.js'
import { PostgRestQuery } from './postgrest-query.js'
import {
  ApiError, NotFoundError,
  type Corpus, type ClassificationInfo, type Totals, type DecadeStats,
  type Document, type FrusDocument, type EnrichedDocument,
  type Entity, type Topic, type TopicDoc,
  type CorpusSearchOptions, type CorpusSearchResult,
  type FrusSearchOptions, type FrusSearchResult,
  type EntitySearchOptions, type PaginationOptions,
  type CorpusId,
} from './types.js'

// Default field selections to minimize payload
const SELECT = {
  search: ['doc_id', 'corpus', 'title', 'authored', 'classification', 'word_cnt', 'source'],
  document: ['doc_id', 'corpus', 'title', 'authored', 'classification', 'body', 'word_cnt', 'pg_cnt', 'char_cnt', 'source', 'doc_lang'],
  frus: ['doc_id', 'title', 'authored', 'classification', 'p_from', 'p_to', 'location', 'chapt_title', 'subject'],
  frusDocument: ['doc_id', 'title', 'authored', 'classification', 'p_from', 'p_to', 'location', 'chapt_title', 'subject', 'body', 'key_content_summary'],
  enriched: ['doc_id', 'corpus', 'title', 'authored', 'classification', 'body', 'topic_names', 'topic_scores', 'entities', 'entgroups', 'wikidata_ids'],
} as const

export class CorpusClient {
  private baseUrl: string
  private timeoutMs: number

  constructor(private config: HistoryLabConfig) {
    this.baseUrl = config.corpusApiUrl.replace(/\/$/, '')
    this.timeoutMs = config.requestTimeoutMs
  }

  // ==========================================
  // SEARCH
  // ==========================================

  async searchDocs(opts: CorpusSearchOptions): Promise<CorpusSearchResult> {
    const limit = Math.min(opts.limit ?? this.config.defaultLimit, 100)
    const offset = opts.offset ?? 0

    const q = this.query('/docs')
      .select(opts.select ?? [...SELECT.search, ...(opts.includeBody ? ['body'] : [])])
      .limit(limit)
      .offset(offset)
      .withCount()
      .range(offset, offset + limit - 1)

    // Full-text search — use full_text column (pre-computed tsvector, not body)
    if (opts.query) {
      q.fts('full_text', opts.query, opts.ftsMode ?? 'plfts')
    }

    // Title search (ilike, not FTS)
    if (opts.titleQuery) {
      q.ilike('title', opts.titleQuery)
    }

    // Corpus filter
    if (opts.corpus) {
      if (Array.isArray(opts.corpus)) {
        q.inList('corpus', opts.corpus)
      } else {
        q.eq('corpus', opts.corpus)
      }
    }

    // Classification filter
    if (opts.classification) {
      if (Array.isArray(opts.classification)) {
        q.inList('classification', opts.classification)
      } else {
        q.eq('classification', opts.classification)
      }
    }

    // Date range
    if (opts.dateFrom) {
      q.gte('authored', opts.dateFrom)
    }
    if (opts.dateTo) {
      q.lt('authored', opts.dateTo)
    }

    // Language
    if (opts.docLanguage) {
      q.eq('doc_lang', opts.docLanguage)
    }

    // Ordering
    q.order(opts.orderBy ?? 'authored', opts.orderDir ?? 'desc')

    const { data, totalCount } = await this.fetchWithCount<RawDoc[]>(q)
    return {
      documents: data.map(normalizeDoc),
      totalCount,
    }
  }

  async getDocument(docId: string, opts?: { enriched?: boolean }): Promise<Document | EnrichedDocument> {
    if (opts?.enriched) {
      return this.getEnrichedDocument(docId)
    }

    const q = this.query('/docs')
      .select([...SELECT.document])
      .eq('doc_id', docId)
      .limit(1)

    const data = await this.fetch<RawDoc[]>(q)
    if (data.length === 0) {
      throw new NotFoundError(`Document not found: ${docId}`, '/docs')
    }
    return normalizeDoc(data[0])
  }

  private async getEnrichedDocument(docId: string): Promise<EnrichedDocument> {
    const q = this.query('/documents')
      .select([...SELECT.enriched])
      .eq('doc_id', docId)
      .limit(1)

    const data = await this.fetch<RawEnrichedDoc[]>(q)
    if (data.length === 0) {
      throw new NotFoundError(`Document not found: ${docId}`, '/documents')
    }
    return normalizeEnrichedDoc(data[0])
  }

  async searchFrus(opts: FrusSearchOptions): Promise<FrusSearchResult> {
    const limit = Math.min(opts.limit ?? this.config.defaultLimit, 100)
    const offset = opts.offset ?? 0

    const q = this.query('/docs_frus')
      .select(opts.select ?? [...SELECT.frus])
      .limit(limit)
      .offset(offset)
      .withCount()
      .range(offset, offset + limit - 1)

    if (opts.query) {
      q.fts('full_text', opts.query, opts.ftsMode ?? 'plfts')
    }
    if (opts.titleQuery) {
      q.ilike('title', opts.titleQuery)
    }
    if (opts.from) {
      q.ilike('p_from', opts.from)
    }
    if (opts.to) {
      q.ilike('p_to', opts.to)
    }
    if (opts.location) {
      q.ilike('location', opts.location)
    }
    if (opts.volumeId) {
      q.eq('volume_id', opts.volumeId)
    }
    if (opts.dateFrom) {
      q.gte('authored', opts.dateFrom)
    }
    if (opts.dateTo) {
      q.lt('authored', opts.dateTo)
    }
    if (opts.classification) {
      if (Array.isArray(opts.classification)) {
        q.inList('classification', opts.classification)
      } else {
        q.eq('classification', opts.classification)
      }
    }

    q.order(opts.orderBy ?? 'authored', opts.orderDir ?? 'desc')

    const { data, totalCount } = await this.fetchWithCount<RawFrusDoc[]>(q)
    return {
      documents: data.map(normalizeFrusDoc),
      totalCount,
    }
  }

  // ==========================================
  // BROWSE / EXPLORE
  // ==========================================

  async listCorpora(): Promise<Corpus[]> {
    const q = this.query('/corpora')
    const data = await this.fetch<RawCorpus[]>(q)
    return data.map(normalizeCorpus)
  }

  async getEntities(opts: EntitySearchOptions): Promise<Entity[]> {
    const limit = Math.min(opts.limit ?? this.config.defaultLimit, 100)

    const q = this.query('/entities')
      .ilike('entity', opts.query)
      .limit(limit)

    if (opts.group) {
      q.eq('entgroup', opts.group)
    }

    if (opts.orderBy === 'entity') {
      q.order('entity', 'asc')
    } else {
      q.order('doc_cnt', 'desc')
    }

    const data = await this.fetch<RawEntity[]>(q)
    return data.map(normalizeEntity)
  }

  async getEntityDocs(entityId: number, opts?: PaginationOptions): Promise<CorpusSearchResult> {
    const limit = Math.min(opts?.limit ?? this.config.defaultLimit, 100)
    const offset = opts?.offset ?? 0

    // First get the doc_ids from entity_docs
    const junctionQuery = this.query('/entity_docs')
      .eq('entity_id', entityId)
      .select(['doc_id'])
      .limit(limit)
      .offset(offset)
      .withCount()
      .range(offset, offset + limit - 1)

    const { data: junctionData, totalCount } = await this.fetchWithCount<{ doc_id: string }[]>(junctionQuery)

    if (junctionData.length === 0) {
      return { documents: [], totalCount: 0 }
    }

    // Then fetch the actual documents
    const docIds = junctionData.map(r => r.doc_id)
    const docsQuery = this.query('/docs')
      .select([...SELECT.search])
      .inList('doc_id', docIds)
      .limit(limit)

    const docs = await this.fetch<RawDoc[]>(docsQuery)
    return {
      documents: docs.map(normalizeDoc),
      totalCount,
    }
  }

  async getTopics(corpus: CorpusId): Promise<Topic[]> {
    const q = this.query('/topics')
      .eq('corpus', corpus)
      .order('topic_id', 'asc')

    const data = await this.fetch<RawTopic[]>(q)
    return data.map(normalizeTopic)
  }

  async getTopicDocs(corpus: CorpusId, topicId: number, opts?: PaginationOptions): Promise<TopicDoc[]> {
    const limit = Math.min(opts?.limit ?? this.config.defaultLimit, 100)
    const offset = opts?.offset ?? 0

    const q = this.query('/topic_docs')
      .eq('corpus', corpus)
      .eq('topic_id', topicId)
      .order('score', 'desc')
      .limit(limit)
      .offset(offset)

    return this.fetch<TopicDoc[]>(q)
  }

  async getClassifications(): Promise<ClassificationInfo[]> {
    const q = this.query('/classifications')
      .order('sensitivity_level', 'asc')

    const data = await this.fetch<RawClassification[]>(q)
    return data.map(r => ({
      name: r.classification,
      sensitivityLevel: r.sensitivity_level,
    }))
  }

  // ==========================================
  // STATS
  // ==========================================

  async getTotals(): Promise<Totals> {
    const q = this.query('/totals')
    const data = await this.fetch<RawTotals[]>(q)
    if (data.length === 0) {
      return { docs: 0, pages: 0, words: 0 }
    }
    return {
      docs: Number(data[0].doc_cnt),
      pages: Number(data[0].pg_cnt ?? 0),
      words: Number(data[0].word_cnt ?? 0),
    }
  }

  async getDecadeStats(): Promise<DecadeStats[]> {
    const q = this.query('/totals_decade')
      .order('decade', 'asc')

    const data = await this.fetch<RawDecade[]>(q)
    return data.map(r => ({
      decade: r.decade,
      docs: Number(r.doc_cnt),
      pages: Number(r.pg_cnt ?? 0),
      words: Number(r.word_cnt ?? 0),
    }))
  }

  // ==========================================
  // INTERNAL
  // ==========================================

  private query(endpoint: string): PostgRestQuery {
    return new PostgRestQuery(this.baseUrl, endpoint)
  }

  private async fetch<T>(q: PostgRestQuery): Promise<T> {
    const url = q.build()
    const response = await fetch(url, {
      headers: q.headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (!response.ok) {
      const body = await response.text()
      let message = `Corpus API error (${response.status})`
      try {
        const err = JSON.parse(body)
        message = err.message ?? message
      } catch { /* use default */ }
      throw new ApiError(message, response.status, url)
    }

    return response.json() as Promise<T>
  }

  private async fetchWithCount<T>(q: PostgRestQuery): Promise<{ data: T; totalCount: number | null }> {
    const url = q.build()
    const response = await fetch(url, {
      headers: q.headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (!response.ok) {
      const body = await response.text()
      let message = `Corpus API error (${response.status})`
      try {
        const err = JSON.parse(body)
        message = err.message ?? message
      } catch { /* use default */ }
      throw new ApiError(message, response.status, url)
    }

    // Parse total count from Content-Range header: "0-24/4552"
    let totalCount: number | null = null
    const contentRange = response.headers.get('Content-Range')
    if (contentRange) {
      const parts = contentRange.split('/')
      if (parts[1] && parts[1] !== '*') {
        totalCount = parseInt(parts[1], 10)
      }
    }

    const data = await response.json() as T
    return { data, totalCount }
  }
}

// ============================================================
// Raw API response types (internal)
// ============================================================

interface RawDoc {
  doc_id: string
  corpus: string
  classification: string
  authored: string | null
  title: string
  body?: string | null
  source?: string | null
  char_cnt?: number | null
  word_cnt?: number | null
  pg_cnt?: number | null
  doc_lang?: string | null
}

interface RawFrusDoc extends RawDoc {
  p_from?: string | null
  p_to?: string | null
  location?: string | null
  chapt_title?: string | null
  subject?: string | null
  volume_id?: string | null
  key_content_summary?: FrusContentSummaryRaw | null
}

interface FrusContentSummaryRaw {
  primary_correspondence?: string | null
  secondary_document?: string | null
  date_range?: string | null
  main_themes?: string[] | null
  key_quote?: string | null
}

interface RawEnrichedDoc extends RawDoc {
  topic_names?: string[] | null
  topic_scores?: number[] | null
  entities?: string[] | null
  entgroups?: string[] | null
  wikidata_ids?: string[] | null
}

interface RawCorpus {
  corpus: string
  title: string
  begin_date: string | null
  end_date: string | null
  doc_cnt: number | string
  pg_cnt: number | string | null
  word_cnt: number | string
  topic_cnt: number | string
  day_cnt: number | string
  mon_cnt: number | string
  yr_cnt: number | string
  agg_date_type: string
  agg_date_fmt: string
}

interface RawEntity {
  entity_id: number
  entity: string
  entgroup: string
  wikidata_id: string
  doc_cnt: number
}

interface RawTopic {
  corpus: string
  topic_id: number
  title: string
  name: string | null
}

interface RawClassification {
  classification: string
  sensitivity_level: number
}

interface RawTotals {
  doc_cnt: number | string
  pg_cnt: number | string | null
  word_cnt: number | string | null
}

interface RawDecade {
  decade: string
  doc_cnt: number | string
  pg_cnt: number | string | null
  word_cnt: number | string | null
}

// ============================================================
// Normalizers (raw API → public types)
// ============================================================

function normalizeDoc(raw: RawDoc): Document {
  return {
    docId: raw.doc_id,
    corpus: raw.corpus,
    title: raw.title,
    date: raw.authored,
    classification: raw.classification,
    body: raw.body ?? null,
    source: raw.source ?? null,
    wordCount: raw.word_cnt ?? null,
    pageCount: raw.pg_cnt ?? null,
    charCount: raw.char_cnt ?? null,
    language: raw.doc_lang ?? null,
    metadata: {},
  }
}

function normalizeFrusDoc(raw: RawFrusDoc): FrusDocument {
  const base = normalizeDoc(raw)
  return {
    ...base,
    from: raw.p_from ?? null,
    to: raw.p_to ?? null,
    location: raw.location ?? null,
    chapterTitle: raw.chapt_title ?? null,
    subject: raw.subject ?? null,
    volumeId: raw.volume_id ?? null,
    keyContentSummary: raw.key_content_summary
      ? {
          primaryCorrespondence: raw.key_content_summary.primary_correspondence ?? null,
          secondaryDocument: raw.key_content_summary.secondary_document ?? null,
          dateRange: raw.key_content_summary.date_range ?? null,
          mainThemes: raw.key_content_summary.main_themes ?? null,
          keyQuote: raw.key_content_summary.key_quote ?? null,
        }
      : null,
  }
}

function normalizeEnrichedDoc(raw: RawEnrichedDoc): EnrichedDocument {
  const base = normalizeDoc(raw)
  return {
    ...base,
    topicNames: raw.topic_names ?? [],
    topicScores: raw.topic_scores ?? [],
    entities: raw.entities ?? [],
    entityGroups: raw.entgroups ?? [],
    wikidataIds: raw.wikidata_ids ?? [],
  }
}

function normalizeCorpus(raw: RawCorpus): Corpus {
  return {
    id: raw.corpus,
    title: raw.title,
    beginDate: raw.begin_date,
    endDate: raw.end_date,
    docCount: Number(raw.doc_cnt),
    pageCount: raw.pg_cnt != null ? Number(raw.pg_cnt) : null,
    wordCount: Number(raw.word_cnt),
    topicCount: Number(raw.topic_cnt),
    dayCount: Number(raw.day_cnt),
    monthCount: Number(raw.mon_cnt),
    yearCount: Number(raw.yr_cnt),
    aggDateType: raw.agg_date_type,
    aggDateFormat: raw.agg_date_fmt,
  }
}

function normalizeEntity(raw: RawEntity): Entity {
  return {
    entityId: raw.entity_id,
    name: raw.entity,
    group: raw.entgroup as Entity['group'],
    wikidataId: raw.wikidata_id || null,
    docCount: raw.doc_cnt,
  }
}

function normalizeTopic(raw: RawTopic): Topic {
  return {
    corpus: raw.corpus,
    topicId: raw.topic_id,
    title: raw.title,
    name: raw.name,
  }
}
