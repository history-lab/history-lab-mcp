import type { HistoryLabConfig } from './config.js'
import { CorpusClient } from './corpus-client.js'
import { VectorClient } from './vector-client.js'
import type {
  VectorSearchOptions, VectorSearchResult,
  CorpusSearchOptions, CorpusSearchResult,
  FrusSearchOptions, FrusSearchResult,
  EntitySearchOptions, PaginationOptions,
  Document, EnrichedDocument, Entity, Topic, TopicDoc,
  Corpus, ClassificationInfo, Totals, DecadeStats,
  CorpusId,
} from './types.js'

export class HistoryLabSearch {
  public readonly vector: VectorClient
  public readonly corpus: CorpusClient

  constructor(config: HistoryLabConfig) {
    this.vector = new VectorClient(config)
    this.corpus = new CorpusClient(config)
  }

  // ==========================================
  // VECTOR SEARCH
  // ==========================================

  /** Whether the vector search API key is configured */
  get vectorAvailable(): boolean {
    return this.vector.isConfigured
  }

  async vectorSearch(opts: VectorSearchOptions): Promise<VectorSearchResult[]> {
    return this.vector.search(opts)
  }

  async vectorGetDocument(r2Key: string): Promise<Document> {
    return this.vector.getDocument(r2Key)
  }

  // ==========================================
  // CORPUS SEARCH
  // ==========================================

  async corpusSearch(opts: CorpusSearchOptions): Promise<CorpusSearchResult> {
    return this.corpus.searchDocs(opts)
  }

  async corpusGetDocument(docId: string, opts?: { enriched?: boolean }): Promise<Document | EnrichedDocument> {
    return this.corpus.getDocument(docId, opts)
  }

  async frusSearch(opts: FrusSearchOptions): Promise<FrusSearchResult> {
    return this.corpus.searchFrus(opts)
  }

  // ==========================================
  // BROWSE / EXPLORE
  // ==========================================

  async listCorpora(): Promise<Corpus[]> {
    return this.corpus.listCorpora()
  }

  async lookupEntities(opts: EntitySearchOptions): Promise<Entity[]> {
    return this.corpus.getEntities(opts)
  }

  async getEntityDocs(entityId: number, opts?: PaginationOptions): Promise<CorpusSearchResult> {
    return this.corpus.getEntityDocs(entityId, opts)
  }

  async getTopics(corpus: CorpusId): Promise<Topic[]> {
    return this.corpus.getTopics(corpus)
  }

  async getTopicDocs(corpus: CorpusId, topicId: number, opts?: PaginationOptions): Promise<TopicDoc[]> {
    return this.corpus.getTopicDocs(corpus, topicId, opts)
  }

  async getClassifications(): Promise<ClassificationInfo[]> {
    return this.corpus.getClassifications()
  }

  // ==========================================
  // STATS
  // ==========================================

  async getTotals(): Promise<Totals> {
    return this.corpus.getTotals()
  }

  async getDecadeStats(): Promise<DecadeStats[]> {
    return this.corpus.getDecadeStats()
  }
}
