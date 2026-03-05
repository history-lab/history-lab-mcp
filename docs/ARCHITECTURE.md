# History Lab MCP — Architecture & Core Library Plan

## Project Overview

A unified TypeScript package that exposes History Lab's two search APIs (vector semantic search + PostgREST corpus search) as both an **MCP server** and a **CLI tool**, sharing a single core library.

---

## Repository Structure

```
history-lab-mcp/
├── package.json
├── tsconfig.json
├── .env.example
│
├── src/
│   ├── core/                    # Shared core library (80-90% of logic)
│   │   ├── config.ts            # Configuration loading, validation
│   │   ├── types.ts             # All shared types/interfaces
│   │   ├── vector-client.ts     # Vector Search API client
│   │   ├── corpus-client.ts     # PostgREST corpus API client
│   │   ├── search.ts            # Unified search orchestrator
│   │   ├── formatters.ts        # Result formatting (markdown, plain, json)
│   │   └── index.ts             # Public API barrel export
│   │
│   ├── mcp/                     # MCP server adapter
│   │   ├── server.ts            # MCP server setup + tool registration
│   │   ├── tools/               # One file per MCP tool
│   │   │   ├── vector-search.ts
│   │   │   ├── corpus-search.ts
│   │   │   ├── get-document.ts
│   │   │   ├── list-corpora.ts
│   │   │   ├── entity-lookup.ts
│   │   │   └── browse-topics.ts
│   │   └── index.ts             # MCP entrypoint
│   │
│   ├── cli/                     # CLI adapter
│   │   ├── commands/            # One file per CLI command
│   │   │   ├── search.ts
│   │   │   ├── document.ts
│   │   │   ├── corpora.ts
│   │   │   ├── entities.ts
│   │   │   └── topics.ts
│   │   └── index.ts             # CLI entrypoint
│   │
│   └── index.ts                 # Library entrypoint (for use as npm package)
│
├── bin/
│   ├── mcp.ts                   # `npx history-lab-mcp` entrypoint
│   └── cli.ts                   # `npx history-lab` entrypoint
│
├── docs/
│   └── ARCHITECTURE.md          # This file
│
└── tasks/
    ├── todo.md
    └── lessons.md
```

---

## Core Library Design

### Principle: Adapters Are Dumb, Core Is Smart

The core library owns **all** business logic. MCP and CLI adapters are thin wrappers that:
1. Parse their respective input format (MCP tool args / CLI argv)
2. Call a core function
3. Format the output for their medium (MCP content blocks / terminal)

No API calls, no filtering logic, no error handling in the adapters.

---

### `config.ts` — Configuration

Single source of truth for all settings. Loaded from env vars with optional `.env` file.

```ts
export interface HistoryLabConfig {
  // Vector Search API
  vectorApiUrl: string       // https://vector-search-worker.nchimicles.workers.dev
  vectorApiKey: string       // Bearer token

  // Corpus API (PostgREST)
  corpusApiUrl: string       // https://api.foiarchive.org

  // Defaults
  defaultTopK: number        // 10
  defaultLimit: number       // 25
  collectionId: string       // 80650a98-fe49-429a-afbd-9dde66e2d02b
}

export function loadConfig(overrides?: Partial<HistoryLabConfig>): HistoryLabConfig
```

Env vars:
- `HISTORYLAB_VECTOR_API_URL`
- `HISTORYLAB_VECTOR_API_KEY`
- `HISTORYLAB_CORPUS_API_URL`

---

### `types.ts` — Shared Types

Both clients normalize into these types. This is what adapters consume — they never see raw API responses.

```ts
// === Normalized document (shared across both APIs) ===
export interface Document {
  docId: string              // e.g. "CIA-RDP79T00429A001400010019-1"
  title: string
  date: string | null        // ISO 8601
  corpus: string             // e.g. "cia", "kissinger", "cfpf"
  classification: string | null
  body: string | null        // Full text (only when fetched individually)
  source: string | null      // Original URL
  wordCount: number | null
  charCount: number | null
  metadata: Record<string, unknown>  // Anything extra
}

// === Search results ===
export interface SearchResult {
  document: Document
  score: number | null       // 0-1 for vector, null for corpus
  matchedChunks: Chunk[]     // Vector search returns chunks; corpus is empty
  source: 'vector' | 'corpus'
}

export interface Chunk {
  text: string
  score: number
}

// === Search options (unified input) ===
export interface SearchOptions {
  query: string
  limit?: number
  dateRange?: DateRange
  corpus?: string
  classification?: string
}

export interface DateRange {
  from?: string              // ISO date or YYYY or YYYY-MM
  to?: string
}

// === Corpus browsing ===
export interface Corpus {
  id: string
  name: string
  description: string
  docCount: number
  dateRange: { from: string; to: string }
}

export interface Entity {
  id: number
  name: string
  wikidataId: string | null
  docCount: number
}

export interface Topic {
  id: number
  corpus: string
  label: string
  terms: string[]
}
```

---

### `vector-client.ts` — Vector Search API

Wraps `https://vector-search-worker.nchimicles.workers.dev`.

```ts
export class VectorClient {
  constructor(private config: HistoryLabConfig) {}

  async search(opts: SearchOptions): Promise<SearchResult[]>
  async getDocument(r2Key: string): Promise<Document>
  async health(): Promise<boolean>
}
```

Responsibilities:
- Converts `SearchOptions.dateRange` into the `authored_year_month` / `authored_year_month_day` filter format
- Converts `queries` string into the API's expected format
- Normalizes raw API response into `SearchResult[]` with `source: 'vector'`
- Extracts `r2Key` from results for document fetching
- Handles auth (Bearer token)

Key mapping: `SearchOptions.dateRange` → vector filter format:
```
{ from: "1962-10", to: "1962-12" }  →  { authored_year_month: { $gte: 196210, $lte: 196212 } }
{ from: "1962-10-16", to: "1962-10-28" }  →  { authored_year_month_day: { $gte: 19621016, $lte: 19621028 } }
```

---

### `corpus-client.ts` — PostgREST Corpus API

Wraps `https://api.foiarchive.org`.

```ts
export class CorpusClient {
  constructor(private config: HistoryLabConfig) {}

  // Search / query
  async searchDocs(opts: SearchOptions): Promise<SearchResult[]>
  async getDocument(docId: string, corpus?: string): Promise<Document>

  // Browse / explore
  async listCorpora(): Promise<Corpus[]>
  async getEntities(query: string, limit?: number): Promise<Entity[]>
  async getEntityDocs(entityId: number, limit?: number): Promise<Document[]>
  async getTopics(corpus: string, limit?: number): Promise<Topic[]>
  async getClassifications(): Promise<{ name: string; count: number }[]>
  async getStats(): Promise<{ docs: number; pages: number; words: number }>

  // Time-based
  async getDecadeStats(): Promise<{ decade: number; count: number }[]>
}
```

Responsibilities:
- Builds PostgREST query strings (`?corpus=eq.cia&title=ilike.*cuba*&limit=25`)
- Converts `SearchOptions` into PostgREST filter params
- Normalizes raw PostgREST JSON arrays into `SearchResult[]` / `Document[]` / etc.
- No auth required (public API)

Key mapping: `SearchOptions` → PostgREST params:
```
{ corpus: "cia" }           →  ?corpus=eq.cia
{ query: "cuba" }           →  ?title=ilike.*cuba*  (title search)
{ classification: "secret"} →  ?classification=eq.secret
{ limit: 10 }               →  ?limit=10
```

---

### `search.ts` — Unified Search Orchestrator

The main entry point both adapters use.

```ts
export class HistoryLabSearch {
  public vector: VectorClient
  public corpus: CorpusClient

  constructor(config: HistoryLabConfig) {
    this.vector = new VectorClient(config)
    this.corpus = new CorpusClient(config)
  }

  // Primary search methods (what tools/commands call)
  async vectorSearch(opts: SearchOptions): Promise<SearchResult[]>
  async corpusSearch(opts: SearchOptions): Promise<SearchResult[]>

  // Document retrieval
  async getDocument(id: string): Promise<Document>

  // Corpus browsing (delegated to corpus client)
  async listCorpora(): Promise<Corpus[]>
  async lookupEntities(query: string, limit?: number): Promise<Entity[]>
  async getEntityDocs(entityId: number, limit?: number): Promise<Document[]>
  async browseTopics(corpus: string, limit?: number): Promise<Topic[]>
  async getStats(): Promise<{ docs: number; pages: number; words: number }>
}
```

This class is intentionally thin — mostly delegates to the two clients. Its value is:
1. Single constructor (one config, both clients)
2. Stable public API that adapters import
3. Place to add cross-cutting concerns later (caching, logging, rate limiting)

---

### `formatters.ts` — Output Formatting

Shared formatting that both adapters can use.

```ts
// For MCP tool responses (markdown)
export function formatSearchResults(results: SearchResult[]): string
export function formatDocument(doc: Document): string
export function formatCorpora(corpora: Corpus[]): string
export function formatEntities(entities: Entity[]): string

// For CLI (terminal-friendly, with optional color)
export function formatSearchResultsForTerminal(results: SearchResult[]): string
export function formatDocumentForTerminal(doc: Document): string
```

MCP tools return markdown. CLI commands return terminal-formatted text. Both call the same formatters with different options.

---

## MCP Tools

Six tools exposed to LLM clients:

| Tool | Description | Core Method |
|------|-------------|-------------|
| `vector_search` | Semantic search using natural language | `search.vectorSearch()` |
| `corpus_search` | Structured search across full corpus (by title, corpus, classification, date) | `search.corpusSearch()` |
| `get_document` | Fetch full text of a specific document | `search.getDocument()` |
| `list_corpora` | List all available document collections with stats | `search.listCorpora()` |
| `entity_lookup` | Find named entities (people, places, orgs) and their document counts | `search.lookupEntities()` |
| `browse_topics` | Explore topic models for a given corpus | `search.browseTopics()` |

### Tool Schema Example (`vector_search`)

```ts
{
  name: "vector_search",
  description: "Semantic search across ~5M declassified historical documents. Use natural language queries. Returns ranked document chunks with relevance scores.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language search query"
      },
      limit: {
        type: "number",
        description: "Number of results (1-100, default 10)"
      },
      date_from: {
        type: "string",
        description: "Start date filter (YYYY, YYYY-MM, or YYYY-MM-DD)"
      },
      date_to: {
        type: "string",
        description: "End date filter (YYYY, YYYY-MM, or YYYY-MM-DD)"
      }
    },
    required: ["query"]
  }
}
```

Each tool file is ~20-30 lines: parse args → call core → format response.

---

## CLI Commands

Mirror the MCP tools as subcommands:

```
history-lab search "Cuban Missile Crisis" --limit 10 --from 1962-10 --to 1962-11
history-lab corpus-search --corpus cia --title "*cuba*" --classification secret
history-lab document CIA-RDP79T00429A001400010019-1
history-lab corpora
history-lab entities "Cuba"
history-lab topics kissinger
```

Each command file: parse argv → call core → print formatted output.

---

## Standards & Conventions

### Error Handling

- Core clients throw typed errors: `ApiError`, `AuthError`, `NotFoundError`
- Adapters catch and format appropriately (MCP returns error content, CLI prints to stderr)
- No silent failures — every error surfaces to the user

```ts
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public endpoint: string
  ) {
    super(message)
  }
}
```

### HTTP Client

- Use native `fetch` (Node 18+, no dependencies)
- Timeout: 30s default
- No retry logic initially — add only if needed

### Dependencies (Minimal)

- `@modelcontextprotocol/sdk` — MCP server protocol
- `commander` — CLI argument parsing
- `dotenv` — Env file loading
- That's it. No axios, no lodash, no bloat.

### TypeScript Config

- Strict mode
- ES2022 target
- Node16 module resolution
- Output to `dist/`

### Package Exports

```json
{
  "name": "history-lab-mcp",
  "bin": {
    "history-lab-mcp": "./dist/bin/mcp.js",
    "history-lab": "./dist/bin/cli.js"
  },
  "exports": {
    ".": "./dist/src/index.js",
    "./mcp": "./dist/src/mcp/index.js",
    "./cli": "./dist/src/cli/index.js"
  }
}
```

This means:
- `npx history-lab-mcp` starts the MCP server (for Claude Code config)
- `npx history-lab search "query"` runs CLI commands
- `import { HistoryLabSearch } from 'history-lab-mcp'` uses it as a library

---

## Data Flow

```
User / LLM
    │
    ├── MCP Protocol ──→ mcp/server.ts ──→ mcp/tools/vector-search.ts ──┐
    │                                                                     │
    └── CLI args ──────→ cli/index.ts ───→ cli/commands/search.ts ──────┤
                                                                         │
                                                              core/search.ts
                                                              ├── vector-client.ts ──→ Vector API
                                                              └── corpus-client.ts ──→ PostgREST API
```

---

## Build Order

1. **Core types + config** — Get the interfaces right first
2. **Vector client** — Connect to vector search, normalize results
3. **Corpus client** — Connect to PostgREST, normalize results
4. **Search orchestrator** — Wire both clients together
5. **Formatters** — Markdown + terminal output
6. **MCP server** — Register tools, wire to core
7. **CLI** — Register commands, wire to core
8. **Test against live APIs** — Verify end-to-end

Each step is independently testable.
