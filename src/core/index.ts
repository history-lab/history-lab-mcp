export { HistoryLabSearch } from './search.js'
export { VectorClient } from './vector-client.js'
export { CorpusClient } from './corpus-client.js'
export { loadConfig, type HistoryLabConfig } from './config.js'

// Re-export all types
export type {
  // Data types
  Document,
  FrusDocument,
  FrusContentSummary,
  EnrichedDocument,
  Chunk,

  // Search options
  VectorSearchOptions,
  VectorSearchResult,
  VectorFileInfo,
  CorpusSearchOptions,
  CorpusSearchResult,
  FrusSearchOptions,
  FrusSearchResult,
  EntitySearchOptions,
  PaginationOptions,

  // Browse types
  Corpus,
  Entity,
  Topic,
  TopicDoc,
  ClassificationInfo,
  Totals,
  DecadeStats,

  // Enums/literals
  CorpusId,
  Classification,
  FtsMode,
  EntityGroup,

  // Errors
  ApiError,
  AuthError,
  NotFoundError,
} from './types.js'

// Re-export enum arrays for runtime use
export { CORPUS_IDS, CLASSIFICATIONS, FTS_MODES, ENTITY_GROUPS } from './types.js'
