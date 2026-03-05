export interface HistoryLabConfig {
  vectorApiUrl: string
  vectorApiKey: string
  corpusApiUrl: string
  defaultTopK: number
  defaultLimit: number
  collectionId: string
  requestTimeoutMs: number
  /** Custom fetch function — used for Cloudflare service bindings */
  vectorFetch?: typeof fetch
}

const DEFAULTS: HistoryLabConfig = {
  vectorApiUrl: 'https://vector-search-worker.nchimicles.workers.dev',
  vectorApiKey: '',
  corpusApiUrl: 'https://api.foiarchive.org',
  defaultTopK: 10,
  defaultLimit: 25,
  collectionId: '80650a98-fe49-429a-afbd-9dde66e2d02b',
  requestTimeoutMs: 30_000,
}

export function loadConfig(overrides?: Partial<HistoryLabConfig>): HistoryLabConfig {
  return {
    ...DEFAULTS,
    vectorApiUrl: process.env.HISTORYLAB_VECTOR_API_URL ?? DEFAULTS.vectorApiUrl,
    vectorApiKey: process.env.HISTORYLAB_VECTOR_API_KEY ?? DEFAULTS.vectorApiKey,
    corpusApiUrl: process.env.HISTORYLAB_CORPUS_API_URL ?? DEFAULTS.corpusApiUrl,
    ...overrides,
  }
}
