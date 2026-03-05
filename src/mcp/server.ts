import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { HistoryLabConfig } from '../core/config.js'
import { HistoryLabSearch } from '../core/search.js'
import { CORPUS_IDS, CLASSIFICATIONS, FTS_MODES, ENTITY_GROUPS } from '../core/types.js'
import type { CorpusId, Classification, FtsMode, EntityGroup } from '../core/types.js'
import {
  formatVectorResults, formatCorpusResults, formatFrusResults,
  formatDocument, formatFrusDocument, formatEnrichedDocument,
  formatCorpora, formatEntities, formatTopics, formatTopicDocs,
  formatTotals, formatDecadeStats, formatClassifications,
} from '../core/formatters.js'

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] }
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
}

export function createServer(config: HistoryLabConfig): McpServer {
  const search = new HistoryLabSearch(config)

  const server = new McpServer({
    name: 'history-lab',
    version: '0.1.0',
  })

  // ==========================================
  // vector_search
  // ==========================================
  server.tool(
    'vector_search',
    'Semantic search across ~5M declassified historical documents using natural language. Returns ranked document chunks with relevance scores. Best for finding documents about a concept or topic.',
    {
      query: z.union([z.string(), z.array(z.string())]).describe('Natural language search query (string or array of strings)'),
      limit: z.number().min(1).max(100).optional().describe('Number of results (1-100, default 10)'),
      date_from: z.string().optional().describe('Start date filter (YYYY, YYYY-MM, or YYYY-MM-DD)'),
      date_to: z.string().optional().describe('End date filter (YYYY, YYYY-MM, or YYYY-MM-DD)'),
    },
    async (args) => {
      try {
        const results = await search.vectorSearch({
          query: args.query,
          limit: args.limit,
          dateFrom: args.date_from,
          dateTo: args.date_to,
        })
        return text(formatVectorResults(results))
      } catch (e: any) {
        return errorResult(e.message)
      }
    },
  )

  // ==========================================
  // corpus_search
  // ==========================================
  server.tool(
    'corpus_search',
    'Full-text search across ~5M declassified documents in the FOI Archive. Searches document bodies using PostgreSQL full-text search. Supports filtering by corpus, classification, date range, and title. Use frus_search for FRUS-specific fields (sender/recipient/location).',
    {
      query: z.string().optional().describe('Full-text search query (searches document body). Supports plain language.'),
      title: z.string().optional().describe('Title search (case-insensitive pattern match, e.g. "cuba" or "vietnam war")'),
      corpus: z.enum(CORPUS_IDS).optional().describe('Filter by document collection'),
      classification: z.enum(CLASSIFICATIONS).optional().describe('Filter by security classification'),
      date_from: z.string().optional().describe('Start date (ISO format, e.g. "1962-01-01")'),
      date_to: z.string().optional().describe('End date (ISO format, e.g. "1963-01-01")'),
      fts_mode: z.enum(['plfts', 'phfts', 'wfts'] as const).optional().describe('Full-text search mode: plfts (plain language, default), phfts (exact phrase), wfts (websearch with -exclusion)'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 25, max 100)'),
      offset: z.number().min(0).optional().describe('Offset for pagination'),
      include_body: z.boolean().optional().describe('Include document body text in results (default false, bodies can be large)'),
    },
    async (args) => {
      try {
        const results = await search.corpusSearch({
          query: args.query,
          titleQuery: args.title,
          corpus: args.corpus as CorpusId,
          classification: args.classification as Classification,
          dateFrom: args.date_from,
          dateTo: args.date_to,
          ftsMode: args.fts_mode as FtsMode,
          limit: args.limit,
          offset: args.offset,
          includeBody: args.include_body,
        })
        return text(formatCorpusResults(results))
      } catch (e: any) {
        return errorResult(e.message)
      }
    },
  )

  // ==========================================
  // frus_search
  // ==========================================
  server.tool(
    'frus_search',
    'Search the Foreign Relations of the United States (FRUS) collection. 312K documents spanning 1620-1989. Includes sender/recipient, location, chapter info, and AI-generated summaries. Use this instead of corpus_search when you need diplomatic metadata.',
    {
      query: z.string().optional().describe('Full-text search query'),
      from: z.string().optional().describe('Sender name (e.g. "kissinger")'),
      to: z.string().optional().describe('Recipient name (e.g. "nixon")'),
      location: z.string().optional().describe('Where the document was authored (e.g. "moscow")'),
      date_from: z.string().optional().describe('Start date (ISO format)'),
      date_to: z.string().optional().describe('End date (ISO format)'),
      classification: z.enum(CLASSIFICATIONS).optional().describe('Filter by classification'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 25)'),
      offset: z.number().min(0).optional().describe('Offset for pagination'),
    },
    async (args) => {
      try {
        const results = await search.frusSearch({
          query: args.query,
          from: args.from,
          to: args.to,
          location: args.location,
          dateFrom: args.date_from,
          dateTo: args.date_to,
          classification: args.classification as Classification,
          limit: args.limit,
          offset: args.offset,
        })
        return text(formatFrusResults(results))
      } catch (e: any) {
        return errorResult(e.message)
      }
    },
  )

  // ==========================================
  // get_document
  // ==========================================
  server.tool(
    'get_document',
    'Fetch the full text and metadata of a specific document by its doc_id. Optionally enrich with entities and topics. For vector search results, use the r2_key parameter instead.',
    {
      doc_id: z.string().optional().describe('Document ID (e.g. "CIA-RDP79T00429A001400010019-1")'),
      r2_key: z.string().optional().describe('R2 storage key from vector search results (for fetching via vector API)'),
      enriched: z.boolean().optional().describe('Include entities and topics (default false, uses /documents view)'),
    },
    async (args) => {
      try {
        if (args.r2_key) {
          const doc = await search.vectorGetDocument(args.r2_key)
          return text(formatDocument(doc))
        }
        if (args.doc_id) {
          const doc = await search.corpusGetDocument(args.doc_id, { enriched: args.enriched })
          if (args.enriched && 'entities' in doc) {
            return text(formatEnrichedDocument(doc))
          }
          return text(formatDocument(doc))
        }
        return errorResult('Provide either doc_id or r2_key')
      } catch (e: any) {
        return errorResult(e.message)
      }
    },
  )

  // ==========================================
  // list_corpora
  // ==========================================
  server.tool(
    'list_corpora',
    'List all available document collections with statistics (document count, page count, word count, date range). Use this to discover what corpora are available.',
    {},
    async () => {
      try {
        const corpora = await search.listCorpora()
        return text(formatCorpora(corpora))
      } catch (e: any) {
        return errorResult(e.message)
      }
    },
  )

  // ==========================================
  // entity_lookup
  // ==========================================
  server.tool(
    'entity_lookup',
    'Find named entities (people, places, organizations) by name. Returns entity IDs, Wikidata links, and document counts. Use entity_documents to get documents for a specific entity.',
    {
      query: z.string().describe('Entity name to search for (e.g. "Castro", "Vietnam", "NATO")'),
      group: z.enum(ENTITY_GROUPS).optional().describe('Filter by entity type: PERSON, LOC, ORG, or OTHER'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 25)'),
    },
    async (args) => {
      try {
        const entities = await search.lookupEntities({
          query: args.query,
          group: args.group as EntityGroup,
          limit: args.limit,
        })
        return text(formatEntities(entities))
      } catch (e: any) {
        return errorResult(e.message)
      }
    },
  )

  // ==========================================
  // entity_documents
  // ==========================================
  server.tool(
    'entity_documents',
    'Get documents associated with a specific entity. Use entity_lookup first to find the entity_id.',
    {
      entity_id: z.number().describe('Entity ID (from entity_lookup results)'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 25)'),
      offset: z.number().min(0).optional().describe('Offset for pagination'),
    },
    async (args) => {
      try {
        const results = await search.getEntityDocs(args.entity_id, {
          limit: args.limit,
          offset: args.offset,
        })
        return text(formatCorpusResults(results))
      } catch (e: any) {
        return errorResult(e.message)
      }
    },
  )

  // ==========================================
  // browse_topics
  // ==========================================
  server.tool(
    'browse_topics',
    'Explore topic models for a given corpus. Lists topics (keyword clusters) or gets top documents for a specific topic. Each corpus has its own topic model.',
    {
      corpus: z.enum(CORPUS_IDS).describe('Corpus to browse topics for'),
      topic_id: z.number().optional().describe('If provided, returns top documents for this topic instead of listing topics'),
      limit: z.number().min(1).max(100).optional().describe('Max documents per topic (default 25)'),
    },
    async (args) => {
      try {
        if (args.topic_id != null) {
          const docs = await search.getTopicDocs(args.corpus as CorpusId, args.topic_id, { limit: args.limit })
          return text(formatTopicDocs(docs, args.corpus, args.topic_id))
        }
        const topics = await search.getTopics(args.corpus as CorpusId)
        return text(formatTopics(topics, args.corpus))
      } catch (e: any) {
        return errorResult(e.message)
      }
    },
  )

  // ==========================================
  // archive_stats
  // ==========================================
  server.tool(
    'archive_stats',
    'Get aggregate statistics about the FOI Archive: total documents/pages/words, decade breakdowns, and classification levels.',
    {
      type: z.enum(['totals', 'decades', 'classifications']).optional().describe('What stats to return (default: totals)'),
    },
    async (args) => {
      try {
        switch (args.type) {
          case 'decades': {
            const stats = await search.getDecadeStats()
            return text(formatDecadeStats(stats))
          }
          case 'classifications': {
            const cls = await search.getClassifications()
            return text(formatClassifications(cls))
          }
          default: {
            const totals = await search.getTotals()
            return text(formatTotals(totals))
          }
        }
      } catch (e: any) {
        return errorResult(e.message)
      }
    },
  )

  return server
}
