/**
 * Benchmark script for History Lab MCP endpoints.
 * Tests all major operations and reports timing + errors.
 *
 * Usage: npx tsx test/benchmark.ts
 * Requires HISTORYLAB_VECTOR_API_KEY env var for vector search tests.
 */

import 'dotenv/config'
import { loadConfig } from '../src/core/config.js'
import { HistoryLabSearch } from '../src/core/search.js'

const config = loadConfig()
const search = new HistoryLabSearch(config)

interface BenchResult {
  name: string
  timeMs: number
  status: 'ok' | 'error'
  detail?: string
}

async function bench(name: string, fn: () => Promise<unknown>): Promise<BenchResult> {
  const start = performance.now()
  try {
    const result = await fn()
    const timeMs = Math.round(performance.now() - start)
    const detail = summarize(result)
    return { name, timeMs, status: 'ok', detail }
  } catch (e: any) {
    const timeMs = Math.round(performance.now() - start)
    return { name, timeMs, status: 'error', detail: e.message }
  }
}

function summarize(result: unknown): string {
  if (result && typeof result === 'object') {
    if ('documents' in result && Array.isArray((result as any).documents)) {
      const r = result as { documents: unknown[]; totalCount?: number | null }
      return `${r.documents.length} docs (total: ${r.totalCount ?? '?'})`
    }
    if (Array.isArray(result)) {
      return `${result.length} items`
    }
    if ('docs' in result) {
      return JSON.stringify(result)
    }
  }
  return String(result).slice(0, 80)
}

async function main() {
  console.log('History Lab MCP Benchmark')
  console.log(`Corpus API: ${config.corpusApiUrl}`)
  console.log(`Vector API: ${config.vectorApiUrl}`)
  console.log(`Timeout: ${config.requestTimeoutMs}ms`)
  console.log(`Vector key: ${config.vectorApiKey ? 'set' : 'NOT SET'}`)
  console.log('---')

  const results: BenchResult[] = []

  // === Stats ===
  results.push(await bench('stats/totals', () => search.getTotals()))
  results.push(await bench('stats/decades', () => search.getDecadeStats()))
  results.push(await bench('stats/classifications', () => search.getClassifications()))

  // === Browse ===
  results.push(await bench('list_corpora', () => search.listCorpora()))
  results.push(await bench('topics/list (frus)', () => search.getTopics('frus')))
  results.push(await bench('topics/docs (frus topic 0)', () => search.getTopicDocs('frus', 0, { limit: 5 })))

  // === Corpus Search ===
  results.push(await bench('corpus/fts simple (cia)', () =>
    search.corpusSearch({ query: 'cuba missile crisis', corpus: 'cia', limit: 5 }),
  ))
  results.push(await bench('corpus/fts + date (cia)', () =>
    search.corpusSearch({ query: 'cuba missile crisis', corpus: 'cia', dateFrom: '1962-01-01', dateTo: '1963-01-01', limit: 5 }),
  ))
  results.push(await bench('corpus/fts + title (cia)', () =>
    search.corpusSearch({ query: 'cuba', titleQuery: 'cuba', corpus: 'cia', limit: 5 }),
  ))
  results.push(await bench('corpus/title only (should error)', () =>
    search.corpusSearch({ titleQuery: 'cuba', limit: 5 }),
  ))
  results.push(await bench('corpus/fts cfpf (large)', () =>
    search.corpusSearch({ query: 'vietnam war', corpus: 'cfpf', limit: 5 }),
  ))
  results.push(await bench('corpus/fts no corpus filter', () =>
    search.corpusSearch({ query: 'nuclear weapons testing', limit: 5 }),
  ))

  // === FRUS Search ===
  results.push(await bench('frus/fts query', () =>
    search.frusSearch({ query: 'Chile coup', limit: 5 }),
  ))
  results.push(await bench('frus/fts + sender', () =>
    search.frusSearch({ query: 'Chile', from: 'kissinger', limit: 5 }),
  ))
  results.push(await bench('frus/sender only', () =>
    search.frusSearch({ from: 'kissinger', to: 'nixon', limit: 5 }),
  ))
  results.push(await bench('frus/sender + date', () =>
    search.frusSearch({ from: 'kissinger', dateFrom: '1973-01-01', dateTo: '1974-01-01', limit: 5 }),
  ))

  // === Entity ===
  results.push(await bench('entity/lookup', () =>
    search.lookupEntities({ query: 'Castro', limit: 5 }),
  ))
  results.push(await bench('entity/docs (id=1)', () =>
    search.getEntityDocs(1, { limit: 5 }),
  ))

  // === Get Document ===
  results.push(await bench('get_doc/by_id', () =>
    search.corpusGetDocument('CIA-RDP79T00429A001400010019-1'),
  ))

  // === Vector Search (requires API key) ===
  if (search.vectorAvailable) {
    results.push(await bench('vector/simple', () =>
      search.vectorSearch({ query: 'soviet nuclear weapons', limit: 5 }),
    ))
    results.push(await bench('vector/date filter', () =>
      search.vectorSearch({ query: 'cuban missile crisis', dateFrom: '1962', dateTo: '1963', limit: 5 }),
    ))
  } else {
    results.push({ name: 'vector/simple', timeMs: 0, status: 'error', detail: 'SKIPPED — no API key' })
    results.push({ name: 'vector/date filter', timeMs: 0, status: 'error', detail: 'SKIPPED — no API key' })
  }

  // === Report ===
  console.log('\nResults:')
  console.log('─'.repeat(90))
  console.log(`${'Test'.padEnd(38)} ${'Time'.padStart(7)} ${'Status'.padEnd(7)} Detail`)
  console.log('─'.repeat(90))

  let errors = 0
  let slowCount = 0
  for (const r of results) {
    const timeStr = r.timeMs > 0 ? `${r.timeMs}ms` : '-'
    const isSlow = r.status === 'ok' && r.timeMs > 3000
    const flag = r.status === 'error' ? 'ERROR' : isSlow ? 'SLOW' : 'OK'
    if (r.status === 'error' && !r.detail?.includes('SKIPPED') && !r.detail?.includes('Title search requires')) errors++
    if (isSlow) slowCount++
    console.log(`${r.name.padEnd(38)} ${timeStr.padStart(7)} ${flag.padEnd(7)} ${r.detail ?? ''}`)
  }

  console.log('─'.repeat(90))
  console.log(`\nTotal: ${results.length} tests, ${errors} errors, ${slowCount} slow (>3s)`)
}

main().catch(console.error)
