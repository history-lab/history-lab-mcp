# History Lab MCP — Part 4: Corpus Client Design (PostgREST)

Based on the full [FOI Archive API Reference](../postgres-api/docs/foiarchive-api-reference.md).

---

## Key Findings That Affect the Plan

Several things from the full API docs change or expand the original architecture:

### 1. Full-Text Search Is Available (and powerful)

The original plan only had `ilike` title search for corpus queries. The API actually supports **four FTS modes** on the `body` and `full_text` columns:

| Mode | Operator | Best for |
|------|----------|----------|
| `plfts` | Plain language | General searches — **use this as default** |
| `phfts` | Phrase match | Exact phrases ("cuban missile crisis") |
| `wfts` | Websearch-style | Google-like syntax with `-` exclusion |
| `fts` | Raw tsquery | Power users, boolean logic |

This means corpus search is much more capable than just structured filtering. It's a real full-text search engine.

**Important:** FTS works on `body` and `full_text` only. Title search must use `ilike`.

### 2. The `/documents` View Is a Game-Changer

The denormalized `/documents` view returns entities, topics, and scores all in one call. Instead of making 3 requests (doc + entities + topics), one request to `/documents?doc_id=eq.X` gets everything.

**Use `/documents` for single-doc lookups. Use `/docs` for search (smaller payload).**

### 3. FRUS Has Rich Metadata

`/docs_frus` has sender/recipient (`p_from`, `p_to`), location, chapter info, and AI-generated `key_content_summary` (JSONB with themes, key quotes, etc). This deserves its own tool or at least special handling.

### 4. Ordering by `authored` Will Timeout Without Null Handling

Must always use `.desc.nullslast` or `.asc.nullsfirst`. The client must enforce this — never let a raw `order=authored.desc` through.

### 5. Entities Are Global (No Corpus Filter)

Can't filter entities by corpus directly. To find corpus-specific entities, must go through `entity_docs` → `docs`. The client should handle this transparently.

### 6. `full_text` Column Returns Raw tsvector

Always exclude from `select` unless specifically needed. Default selects should omit it.

---

## Revised Corpus Client API

```ts
export class CorpusClient {
  constructor(private config: HistoryLabConfig) {}

  // ==========================================
  // SEARCH
  // ==========================================

  /**
   * Full-text search across document bodies.
   * Default FTS mode: plfts (plain language).
   */
  async searchDocs(opts: CorpusSearchOptions): Promise<CorpusSearchResult>

  /**
   * Get a single document with full text.
   * Uses /docs for basic, /documents for enriched (with entities + topics).
   */
  async getDocument(docId: string, opts?: { enriched?: boolean }): Promise<Document>

  /**
   * Search FRUS documents specifically (sender/recipient/location/summaries).
   */
  async searchFrus(opts: FrusSearchOptions): Promise<CorpusSearchResult>

  // ==========================================
  // BROWSE / EXPLORE
  // ==========================================

  async listCorpora(): Promise<Corpus[]>
  async getEntities(opts: EntitySearchOptions): Promise<Entity[]>
  async getEntityDocs(entityId: number, opts?: PaginationOptions): Promise<Document[]>
  async getTopics(corpus: string): Promise<Topic[]>
  async getTopicDocs(corpus: string, topicId: number, opts?: PaginationOptions): Promise<Document[]>
  async getClassifications(): Promise<Classification[]>

  // ==========================================
  // STATS
  // ==========================================

  async getTotals(): Promise<Totals>
  async getDecadeStats(): Promise<DecadeStats[]>
}
```

---

## Types Specific to Corpus Client

```ts
// === Search options ===

export interface CorpusSearchOptions {
  // What to search
  query?: string                     // FTS on body (uses plfts by default)
  titleQuery?: string                // ilike on title (FTS not supported on title)

  // Filters
  corpus?: string | string[]         // Single or multiple corpora
  classification?: string | string[] // Single or multiple
  dateFrom?: string                  // ISO date: authored >= value
  dateTo?: string                    // ISO date: authored < value
  docLanguage?: string               // e.g. "en"

  // FTS mode
  ftsMode?: 'plfts' | 'phfts' | 'wfts' | 'fts'  // Default: plfts

  // Pagination & ordering
  limit?: number                     // Default: 25
  offset?: number
  orderBy?: 'authored' | 'word_cnt' | 'doc_id'  // Default: authored
  orderDir?: 'asc' | 'desc'         // Default: desc

  // Field selection
  includeBody?: boolean              // Default: false (bodies are large)
  select?: string[]                  // Custom field list
}

export interface FrusSearchOptions extends CorpusSearchOptions {
  from?: string        // p_from ilike (sender)
  to?: string          // p_to ilike (recipient)
  location?: string    // location ilike
  volumeId?: string    // Specific FRUS volume
}

export interface EntitySearchOptions {
  query: string                          // ilike match on entity name
  group?: 'PERSON' | 'LOC' | 'ORG' | 'OTHER'  // Filter by entity type
  limit?: number                         // Default: 25
  orderBy?: 'doc_cnt' | 'entity'         // Default: doc_cnt desc
}

export interface PaginationOptions {
  limit?: number
  offset?: number
}

// === Results ===

export interface CorpusSearchResult {
  documents: Document[]
  totalCount: number | null   // From Content-Range header when available
}

export interface Classification {
  name: string
  sensitivityLevel: number    // 1=most sensitive, 6=least
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
```

---

## Query Builder

The corpus client needs an internal query builder to safely construct PostgREST URLs. This encapsulates all the gotchas.

```ts
// Internal — not exported from the core library

class PostgRestQuery {
  private params: URLSearchParams

  constructor(private baseUrl: string, private endpoint: string) {
    this.params = new URLSearchParams()
  }

  eq(col: string, value: string): this
  neq(col: string, value: string): this
  gt(col: string, value: string): this
  gte(col: string, value: string): this
  lt(col: string, value: string): this
  lte(col: string, value: string): this
  ilike(col: string, pattern: string): this
  inList(col: string, values: string[]): this
  fts(col: string, query: string, mode: 'plfts' | 'phfts' | 'wfts' | 'fts'): this

  select(fields: string[]): this
  order(col: string, dir: 'asc' | 'desc'): this   // Auto-adds null handling for authored
  limit(n: number): this
  offset(n: number): this

  // Logical operators
  or(conditions: string[]): this
  and(conditions: string[]): this

  build(): string    // Returns full URL
  headers(): Record<string, string>  // Accept, Range, Prefer headers
}
```

### Built-In Gotcha Protection

The query builder automatically handles the known issues:

```ts
order(col: string, dir: 'asc' | 'desc'): this {
  if (col === 'authored') {
    // MUST add null modifier or query will timeout
    const nullMod = dir === 'desc' ? 'nullslast' : 'nullsfirst'
    this.params.set('order', `${col}.${dir}.${nullMod}`)
  } else {
    this.params.set('order', `${col}.${dir}`)
  }
  return this
}

select(fields: string[]): this {
  // Always exclude full_text tsvector column (returns raw tokens)
  const clean = fields.filter(f => f !== 'full_text')
  this.params.set('select', clean.join(','))
  return this
}
```

---

## Default Field Selection

Different endpoints get different default `select` values to minimize payload:

```ts
const DEFAULT_SELECTS = {
  // Search results — no body, no full_text
  search: ['doc_id', 'corpus', 'title', 'authored', 'classification', 'word_cnt', 'source'],

  // Single doc — include body
  document: ['doc_id', 'corpus', 'title', 'authored', 'classification', 'body', 'word_cnt', 'pg_cnt', 'source', 'doc_lang'],

  // FRUS search — include sender/recipient/location
  frus: ['doc_id', 'title', 'authored', 'classification', 'p_from', 'p_to', 'location', 'chapt_title', 'subject'],

  // FRUS single doc — include summary + body
  frusDocument: ['doc_id', 'title', 'authored', 'classification', 'p_from', 'p_to', 'location', 'chapt_title', 'subject', 'body', 'key_content_summary'],

  // Enriched doc (from /documents view)
  enriched: ['doc_id', 'corpus', 'title', 'authored', 'classification', 'body', 'topic_names', 'topic_scores', 'entities', 'entgroups', 'wikidata_ids'],
}
```

---

## Revised MCP Tools (Corpus Side)

The original plan had 3 corpus-related tools. Expanding to 5 based on what the API actually supports:

| Tool | Description | Endpoint | Key Params |
|------|-------------|----------|------------|
| `corpus_search` | Full-text + structured search across all corpora | `/docs` | query, corpus, classification, dateFrom/dateTo |
| `corpus_document` | Get full document text (optionally enriched with entities/topics) | `/docs` or `/documents` | docId, enriched |
| `frus_search` | Search FRUS docs by sender, recipient, location, theme | `/docs_frus` | from, to, location, query |
| `entity_lookup` | Find named entities (people/places/orgs) by name | `/entities` | query, group |
| `entity_documents` | Get documents associated with a specific entity | `/entity_docs` → `/docs` | entityId |
| `browse_topics` | List topic models for a corpus, or get docs for a topic | `/topics`, `/topic_docs` | corpus, topicId |
| `archive_stats` | Get collection stats, decade breakdowns, classifications | `/corpora`, `/totals`, `/totals_decade` | — |

### Tool Schema: `corpus_search`

```ts
{
  name: "corpus_search",
  description: `Full-text search across ~5M declassified documents in the FOI Archive.
Searches document bodies using PostgreSQL full-text search.
Supports filtering by corpus, classification, date range, and title.
Use frus_search for FRUS-specific fields (sender/recipient/location).`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Full-text search query (searches document body). Supports plain language."
      },
      title: {
        type: "string",
        description: "Title search (case-insensitive pattern match, e.g. 'cuba' or 'vietnam war')"
      },
      corpus: {
        type: "string",
        enum: ["frus", "cables", "cia", "clinton", "briefing", "cfpf", "kissinger", "nato", "un", "worldbank", "cabinet", "cpdoc"],
        description: "Filter by document collection"
      },
      classification: {
        type: "string",
        enum: ["top secret", "secret", "confidential", "unclassified", "limited official use", "restricted", "unknown", "strictly confidential", "no security level"],
        description: "Filter by security classification"
      },
      date_from: {
        type: "string",
        description: "Start date (ISO format, e.g. '1962-01-01')"
      },
      date_to: {
        type: "string",
        description: "End date (ISO format, e.g. '1963-01-01')"
      },
      fts_mode: {
        type: "string",
        enum: ["plfts", "phfts", "wfts"],
        description: "Full-text search mode: plfts (plain language, default), phfts (exact phrase), wfts (websearch with -exclusion)"
      },
      limit: {
        type: "number",
        description: "Max results (default 25, max 100)"
      },
      include_body: {
        type: "boolean",
        description: "Include document body text in results (default false, bodies can be large)"
      }
    }
  }
}
```

### Tool Schema: `frus_search`

```ts
{
  name: "frus_search",
  description: `Search the Foreign Relations of the United States (FRUS) collection.
312K documents spanning 1620-1989. Includes sender/recipient, location,
chapter info, and AI-generated summaries (key_content_summary).
Use this instead of corpus_search when you need diplomatic metadata.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Full-text search query"
      },
      from: {
        type: "string",
        description: "Sender name (e.g. 'kissinger')"
      },
      to: {
        type: "string",
        description: "Recipient name (e.g. 'nixon')"
      },
      location: {
        type: "string",
        description: "Where the document was authored (e.g. 'moscow')"
      },
      date_from: { type: "string" },
      date_to: { type: "string" },
      limit: { type: "number" }
    }
  }
}
```

---

## Request Examples (What the Client Builds)

### corpus_search: "vietnam war documents from CIA, top secret"

```
GET /docs?corpus=eq.cia&classification=eq.top+secret&body=plfts.vietnam+war&limit=25&select=doc_id,corpus,title,authored,classification,word_cnt,source&order=authored.desc.nullslast
```

### corpus_search: exact phrase "cuban missile crisis"

```
GET /docs?body=phfts.cuban+missile+crisis&limit=25&select=doc_id,corpus,title,authored,classification,word_cnt,source&order=authored.desc.nullslast
```

### corpus_search: multi-corpus with date range

```
GET /docs?corpus=in.(kissinger,clinton,briefing)&body=plfts.middle+east&authored=gte.1973-01-01&authored=lt.1976-01-01&limit=25&select=doc_id,corpus,title,authored,classification,word_cnt,source&order=authored.desc.nullslast
```

### frus_search: Kissinger to Nixon about China

```
GET /docs_frus?p_from=ilike.*kissinger*&p_to=ilike.*nixon*&body=plfts.china&limit=25&select=doc_id,title,authored,p_from,p_to,location,chapt_title,subject&order=authored.desc.nullslast
```

### corpus_document: enriched (with entities + topics)

```
GET /documents?doc_id=eq.frus1955-57v17d387&select=doc_id,corpus,title,authored,classification,body,topic_names,topic_scores,entities,entgroups,wikidata_ids
```

### entity_lookup: people named "Castro"

```
GET /entities?entity=ilike.*castro*&entgroup=eq.PERSON&order=doc_cnt.desc&limit=25
```

### browse_topics: CIA topics, then docs for topic 5

```
GET /topics?corpus=eq.cia&order=topic_id.asc
GET /topic_docs?corpus=eq.cia&topic_id=eq.5&order=score.desc&limit=25
```

---

## Total Count Support

For search results, request exact count via headers:

```ts
async searchDocs(opts: CorpusSearchOptions): Promise<CorpusSearchResult> {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Prefer': 'count=exact',
      'Range-Unit': 'items',
      'Range': `${offset}-${offset + limit - 1}`,
    }
  })

  const contentRange = response.headers.get('Content-Range')
  // "0-24/4552" → totalCount = 4552
  const totalCount = contentRange
    ? parseInt(contentRange.split('/')[1])
    : null

  return {
    documents: await response.json(),
    totalCount,
  }
}
```

This lets the MCP tool report "Showing 25 of 4,552 results" — much more useful for the LLM to know if it should refine the query.

---

## Error Handling

PostgREST returns structured errors:

```json
{
  "hint": null,
  "details": null,
  "code": "PGRST100",
  "message": "\"unexpected '=' expecting letter, digit, \"-\", \"_\" ..."
}
```

The client should catch these and return clear messages:

```ts
if (!response.ok) {
  const error = await response.json()
  throw new ApiError(
    `Corpus API error: ${error.message}`,
    response.status,
    url
  )
}
```

Common errors to handle gracefully:
- 400 on bad FTS syntax → suggest using `plfts` instead of `fts`
- Timeout on unmodified `authored` ordering → should never happen (query builder prevents it)
- Empty results → return empty array, not error
