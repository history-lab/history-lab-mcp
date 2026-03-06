import { Command } from 'commander'
import { loadConfig } from '../core/config.js'
import { HistoryLabSearch } from '../core/search.js'
import { CORPUS_IDS, CLASSIFICATIONS, ENTITY_GROUPS } from '../core/types.js'
import type { CorpusId, Classification, FtsMode, EntityGroup } from '../core/types.js'
import {
  formatVectorResults, formatCorpusResults, formatFrusResults,
  formatDocument, formatFrusDocument, formatEnrichedDocument,
  formatCorpora, formatEntities, formatTopics, formatTopicDocs,
  formatTotals, formatDecadeStats, formatClassifications,
} from '../core/formatters.js'
import { getFormat, output, errorOut } from './output.js'

export function createCli(): Command {
  const program = new Command()
    .name('history-lab')
    .description('Search ~5M declassified historical documents from the FOI Archive.')
    .version('0.1.0')

  // Shared options
  const addOutputOpts = (cmd: Command) =>
    cmd
      .option('--json', 'Output as JSON')
      .option('--markdown', 'Output as Markdown')

  // Lazy-init search client
  let _search: HistoryLabSearch | null = null
  const getSearch = () => {
    if (!_search) _search = new HistoryLabSearch(loadConfig())
    return _search
  }

  // ==========================================
  // search (vector)
  // ==========================================
  addOutputOpts(
    program
      .command('search <query>')
      .description('Semantic search using natural language (vector search)')
      .option('-n, --limit <n>', 'Number of results (1-100)', '10')
      .option('--from <date>', 'Start date filter (YYYY, YYYY-MM, or YYYY-MM-DD)')
      .option('--to <date>', 'End date filter')
  ).action(async (query: string, opts) => {
    try {
      const results = await getSearch().vectorSearch({
        query,
        limit: parseInt(opts.limit),
        dateFrom: opts.from,
        dateTo: opts.to,
      })
      const fmt = getFormat(opts)
      output(results, () => formatVectorResults(results), fmt)
    } catch (e: any) {
      errorOut(e.message)
    }
  })

  // ==========================================
  // corpus-search
  // ==========================================
  addOutputOpts(
    program
      .command('corpus-search')
      .description('Full-text search across the corpus (PostgreSQL FTS)')
      .option('-q, --query <text>', 'Full-text search query (body)')
      .option('-t, --title <text>', 'Title search (case-insensitive)')
      .option('-c, --corpus <id>', `Corpus: ${CORPUS_IDS.join(', ')}`)
      .option('--classification <level>', 'Security classification filter')
      .option('--from <date>', 'Start date (ISO format)')
      .option('--to <date>', 'End date (ISO format)')
      .option('--fts-mode <mode>', 'FTS mode: plfts (default), phfts (phrase), wfts (websearch)')
      .option('-n, --limit <n>', 'Max results', '25')
      .option('--offset <n>', 'Offset for pagination', '0')
      .option('--body', 'Include document body text')
  ).action(async (opts) => {
    if (!opts.query && !opts.title && !opts.corpus) {
      errorOut('Provide at least --query, --title, or --corpus')
    }
    try {
      const results = await getSearch().corpusSearch({
        query: opts.query,
        titleQuery: opts.title,
        corpus: opts.corpus as CorpusId,
        classification: opts.classification as Classification,
        dateFrom: opts.from,
        dateTo: opts.to,
        ftsMode: opts.ftsMode as FtsMode,
        limit: parseInt(opts.limit),
        offset: parseInt(opts.offset),
        includeBody: opts.body,
      })
      const fmt = getFormat(opts)
      output(results, () => formatCorpusResults(results), fmt)
    } catch (e: any) {
      errorOut(e.message)
    }
  })

  // ==========================================
  // frus-search
  // ==========================================
  addOutputOpts(
    program
      .command('frus-search')
      .description('Search FRUS documents (sender/recipient/location)')
      .option('-q, --query <text>', 'Full-text search query')
      .option('--sender <name>', 'Sender name (e.g. "kissinger")')
      .option('--recipient <name>', 'Recipient name (e.g. "nixon")')
      .option('--location <place>', 'Where authored (e.g. "moscow")')
      .option('--from <date>', 'Start date')
      .option('--to <date>', 'End date')
      .option('--classification <level>', 'Classification filter')
      .option('-n, --limit <n>', 'Max results', '25')
      .option('--offset <n>', 'Offset', '0')
  ).action(async (opts) => {
    if (!opts.query && !opts.sender && !opts.recipient && !opts.location) {
      errorOut('Provide at least --query, --sender, --recipient, or --location')
    }
    try {
      const results = await getSearch().frusSearch({
        query: opts.query,
        from: opts.sender,
        to: opts.recipient,
        location: opts.location,
        dateFrom: opts.from,
        dateTo: opts.to,
        classification: opts.classification as Classification,
        limit: parseInt(opts.limit),
        offset: parseInt(opts.offset),
      })
      const fmt = getFormat(opts)
      output(results, () => formatFrusResults(results), fmt)
    } catch (e: any) {
      errorOut(e.message)
    }
  })

  // ==========================================
  // document
  // ==========================================
  addOutputOpts(
    program
      .command('document <id>')
      .description('Fetch full text of a document by doc_id')
      .option('--enriched', 'Include entities and topics')
      .option('--r2', 'Treat ID as an R2 key (for vector search results)')
  ).action(async (id: string, opts) => {
    try {
      if (opts.r2) {
        const doc = await getSearch().vectorGetDocument(id)
        const fmt = getFormat(opts)
        output(doc, () => formatDocument(doc), fmt)
      } else {
        const doc = await getSearch().corpusGetDocument(id, { enriched: opts.enriched })
        const fmt = getFormat(opts)
        if (opts.enriched && 'entities' in doc) {
          output(doc, () => formatEnrichedDocument(doc), fmt)
        } else {
          output(doc, () => formatDocument(doc), fmt)
        }
      }
    } catch (e: any) {
      errorOut(e.message)
    }
  })

  // ==========================================
  // corpora
  // ==========================================
  addOutputOpts(
    program
      .command('corpora')
      .description('List all available document collections')
  ).action(async (opts) => {
    try {
      const corpora = await getSearch().listCorpora()
      const fmt = getFormat(opts)
      output(corpora, () => formatCorpora(corpora), fmt)
    } catch (e: any) {
      errorOut(e.message)
    }
  })

  // ==========================================
  // entities
  // ==========================================
  addOutputOpts(
    program
      .command('entities <query>')
      .description('Look up named entities (people, places, orgs)')
      .option('-g, --group <type>', `Entity type: ${ENTITY_GROUPS.join(', ')}`)
      .option('-n, --limit <n>', 'Max results', '25')
  ).action(async (query: string, opts) => {
    try {
      const entities = await getSearch().lookupEntities({
        query,
        group: opts.group as EntityGroup,
        limit: parseInt(opts.limit),
      })
      const fmt = getFormat(opts)
      output(entities, () => formatEntities(entities), fmt)
    } catch (e: any) {
      errorOut(e.message)
    }
  })

  // ==========================================
  // entity-docs
  // ==========================================
  addOutputOpts(
    program
      .command('entity-docs <entityId>')
      .description('Get documents for a specific entity (by entity_id)')
      .option('-n, --limit <n>', 'Max results', '25')
      .option('--offset <n>', 'Offset', '0')
  ).action(async (entityId: string, opts) => {
    try {
      const results = await getSearch().getEntityDocs(parseInt(entityId), {
        limit: parseInt(opts.limit),
        offset: parseInt(opts.offset),
      })
      const fmt = getFormat(opts)
      output(results, () => formatCorpusResults(results), fmt)
    } catch (e: any) {
      errorOut(e.message)
    }
  })

  // ==========================================
  // topics
  // ==========================================
  addOutputOpts(
    program
      .command('topics <corpus>')
      .description('Browse topic models for a corpus')
      .option('--topic-id <id>', 'Get top documents for this topic')
      .option('-n, --limit <n>', 'Max docs per topic', '25')
  ).action(async (corpus: string, opts) => {
    try {
      if (opts.topicId) {
        const docs = await getSearch().getTopicDocs(
          corpus as CorpusId,
          parseInt(opts.topicId),
          { limit: parseInt(opts.limit) },
        )
        const fmt = getFormat(opts)
        output(docs, () => formatTopicDocs(docs, corpus, parseInt(opts.topicId)), fmt)
      } else {
        const topics = await getSearch().getTopics(corpus as CorpusId)
        const fmt = getFormat(opts)
        output(topics, () => formatTopics(topics, corpus), fmt)
      }
    } catch (e: any) {
      errorOut(e.message)
    }
  })

  // ==========================================
  // stats
  // ==========================================
  addOutputOpts(
    program
      .command('stats')
      .description('Archive statistics')
      .option('--decades', 'Show decade breakdown')
      .option('--classifications', 'Show classification levels')
  ).action(async (opts) => {
    try {
      const fmt = getFormat(opts)
      if (opts.decades) {
        const stats = await getSearch().getDecadeStats()
        output(stats, () => formatDecadeStats(stats), fmt)
      } else if (opts.classifications) {
        const cls = await getSearch().getClassifications()
        output(cls, () => formatClassifications(cls), fmt)
      } else {
        const totals = await getSearch().getTotals()
        output(totals, () => formatTotals(totals), fmt)
      }
    } catch (e: any) {
      errorOut(e.message)
    }
  })

  return program
}
