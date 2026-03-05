# FOI Archive API Reference

**Base URL:** `https://api.foiarchive.org/`
**Engine:** PostgREST v7.0.1
**Formats:** JSON (default), CSV, PostgREST object
**Project:** [History Lab at Columbia University](https://lab.history.columbia.edu/)
**Dataset:** [Hugging Face (CC-BY-NC-4.0)](https://huggingface.co/datasets/HistoryLab/foiarchive)
**Source Code:** [github.com/history-lab/foiarchive-postgres](https://github.com/history-lab/foiarchive-postgres)

---

## Overview

The FOI Archive API exposes ~5 million declassified government documents (18M+ pages, 2.8B+ words) across 11 document collections via a PostgREST interface over PostgreSQL.

---

## Endpoints

| Endpoint | Type | Methods | Description |
|---|---|---|---|
| `/` | Introspection | GET | OpenAPI spec |
| `/docs` | Table | GET, POST, PATCH, DELETE | Core documents (metadata + full text) |
| `/docs_frus` | Table | GET, POST, PATCH, DELETE | FRUS-specific extended metadata |
| `/documents` | View | GET | Denormalized docs with entities + topics (arrays) |
| `/entities` | Table | GET, POST, PATCH, DELETE | Named entities (people, places, orgs) with Wikidata links |
| `/entity_docs` | Table | GET, POST, PATCH, DELETE | Entity-to-document junction table |
| `/topics` | Table | GET, POST, PATCH, DELETE | Topic model results per corpus |
| `/topic_docs` | Table | GET, POST, PATCH, DELETE | Topic-to-document scores (junction table) |
| `/corpora` | View | GET | Corpus metadata and statistics |
| `/classifications` | Table | GET, POST, PATCH, DELETE | Classification level lookup |
| `/totals` | View | GET | Aggregate totals (single row) |
| `/totals_decade` | View | GET | Aggregate totals by decade |

---

## Schema Details

### `/docs` -- Core Documents

Primary table containing all documents with full text.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `doc_id` | varchar(40) | **PK** | Unique document identifier |
| `corpus` | corpus_t enum | NOT NULL | Corpus identifier |
| `classification` | classification_t enum | NOT NULL | Security classification |
| `authored` | timestamptz | YES | Date/time authored |
| `title` | text | NOT NULL | Document title |
| `body` | text | YES | Plain text body |
| `full_text` | tsvector | NOT NULL | PostgreSQL full-text search vector |
| `source` | text | YES | Source attribution |
| `char_cnt` | integer | YES | Character count |
| `word_cnt` | integer | YES | Word count |
| `pg_cnt` | integer | YES | Page count |
| `doc_lang` | text | YES | Document language |

### `/docs_frus` -- FRUS Extended Metadata

Supplements `/docs` for the Foreign Relations of the United States series.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `doc_id` | varchar(40) | YES | Matches `docs.doc_id` |
| `volume_id` | varchar(31) | YES | FRUS volume identifier |
| `chapt_title` | text | YES | Chapter title |
| `title` | text | YES | Document title |
| `title_docview` | text | YES | Display title |
| `subject` | text | YES | Subject line |
| `authored` | timestamptz | YES | Date authored |
| `location` | text | YES | Where the document was authored |
| `p_from` | text | YES | Sender |
| `p_to` | text | YES | Recipient |
| `source` | text | YES | Source attribution |
| `classification` | varchar(16) | YES | Classification (as text, not enum) |
| `body` | text | YES | Body text |
| `raw_body` | text | YES | Raw/unprocessed body |
| `subtype` | varchar(64) | YES | e.g. "historical-document" |
| `num_pages` | bigint | YES | Page count |
| `key_content_summary` | jsonb | YES | AI-generated structured summary |

The `key_content_summary` JSONB field contains:
- `primary_correspondence` -- Summary of main document
- `secondary_document` -- Summary of enclosed/referenced docs
- `date_range` -- Date range covered
- `main_themes` -- Array of theme strings
- `key_quote` -- Notable quote from the document

### `/documents` -- Denormalized View

Read-only view joining docs with all entity and topic data. Useful for getting everything about a document in one call.

| Field | Type | Notes |
|---|---|---|
| `doc_id` | varchar(40) | Document identifier |
| `corpus` | corpus_t | Corpus |
| `classification` | classification_t | Classification |
| `authored` | timestamptz | Date authored |
| `title` | text | Title |
| `body` | text | Body text |
| `full_text` | tsvector | FTS vector |
| `topic_names` | text[] | Array of topic labels (5 keywords each) |
| `topic_titles` | text[] | Array of topic labels (3 keywords each) |
| `topic_scores` | float[] | Array of relevance scores |
| `topic_ids` | integer[] | Array of topic IDs |
| `entities` | text[] | Array of entity names |
| `entgroups` | text[] | Array of entity types (PERSON, LOC, ORG) |
| `wikidata_ids` | text[] | Array of Wikidata Q-identifiers |
| `entity_ids` | integer[] | Array of entity IDs |

### `/entities` -- Named Entities

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `entity_id` | integer | **PK** | Auto-increment ID |
| `entity` | text | NOT NULL | Entity name |
| `entgroup` | text | NOT NULL | Type: "PERSON", "LOC", "ORG", "OTHER" |
| `wikidata_id` | text | NOT NULL | Wikidata Q-identifier |
| `doc_cnt` | integer | YES | Number of documents containing this entity |
| `created` | timestamptz | NOT NULL | Record creation time |
| `updated` | timestamptz | NOT NULL | Record update time |

### `/entity_docs` -- Entity-Document Junction

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `entity_docs_id` | integer | **PK** | Auto-increment ID |
| `entity_id` | integer | NOT NULL | **FK** -> `entities.entity_id` |
| `doc_id` | varchar(40) | NOT NULL | **FK** -> `docs.doc_id` |

### `/topics` -- Topic Models

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `corpus` | corpus_t | **PK** (composite) | Corpus identifier |
| `topic_id` | integer | **PK** (composite) | Topic number within corpus |
| `title` | text | NOT NULL | Short label (3 stemmed keywords) |
| `name` | text | YES | Longer label (5 stemmed keywords) |

### `/topic_docs` -- Topic-Document Scores

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `corpus` | corpus_t | **PK** (composite), **FK** -> `topics.corpus` | Corpus |
| `topic_id` | integer | **PK** (composite), **FK** -> `topics.topic_id` | Topic |
| `doc_id` | varchar(40) | **PK** (composite), **FK** -> `docs.doc_id` | Document |
| `score` | double precision | NOT NULL | Relevance score (0.0-1.0) |

### `/corpora` -- Corpus Metadata (View)

| Field | Type | Notes |
|---|---|---|
| `corpus` | corpus_t | Corpus identifier |
| `title` | text | Human-readable name |
| `begin_date` | date | Earliest document date |
| `end_date` | date | Latest document date |
| `doc_cnt` | bigint | Total documents |
| `pg_cnt` | bigint | Total pages (null for some) |
| `word_cnt` | bigint | Total words |
| `topic_cnt` | bigint | Number of topic model topics |
| `day_cnt` | bigint | Distinct days with documents |
| `mon_cnt` | bigint | Distinct months |
| `yr_cnt` | bigint | Distinct years |
| `agg_date_type` | text | Aggregation type: "decade", "year", "month" |
| `agg_date_fmt` | text | Date format: "decade", "YYYY", "YYYY-MM" |

### `/classifications` -- Classification Lookup

| Field | Type | Notes |
|---|---|---|
| `classification` | text | **PK** -- Classification label |
| `sensitivity_level` | smallint | 1=most sensitive, 6=least |

Values:
| Classification | Sensitivity |
|---|---|
| top secret | 1 |
| secret | 2 |
| strictly confidential | 2 |
| confidential | 3 |
| restricted | 3 |
| limited official use | 4 |
| unclassified | 5 |
| unknown | 6 |
| no security level | 6 |

### `/totals` -- Aggregate Totals (View, single row)

| Field | Type |
|---|---|
| `doc_cnt` | bigint |
| `pg_cnt` | bigint |
| `word_cnt` | bigint |

### `/totals_decade` -- Totals by Decade (View)

| Field | Type |
|---|---|
| `decade` | text |
| `doc_cnt` | bigint |
| `pg_cnt` | bigint |
| `word_cnt` | bigint |

---

## Enums

### `corpus_t`

`frus`, `cables`, `cia`, `clinton`, `briefing`, `cfpf`, `kissinger`, `nato`, `un`, `worldbank`, `cabinet`, `cpdoc`

### `classification_t`

`top secret`, `secret`, `confidential`, `unclassified`, `limited official use`, `restricted`, `unknown`, `strictly confidential`, `no security level`

---

## Relationships (Foreign Keys)

```
docs (doc_id PK)
  |
  +--< entity_docs.doc_id FK
  |       |
  |       +-- entity_docs.entity_id FK --> entities.entity_id PK
  |
  +--< topic_docs.doc_id FK
  |       |
  |       +-- topic_docs.(corpus, topic_id) FK --> topics.(corpus, topic_id) PK
  |
  +--- docs_frus.doc_id (logical join, no formal FK)

classifications.classification <-- docs.classification (enum match)
corpora.corpus <-- docs.corpus (enum match)

documents (view) = docs JOIN topic_docs JOIN topics JOIN entity_docs JOIN entities
```

---

## Available Corpora

| Corpus | Title | Date Range | Docs | Pages | Words | Topics |
|---|---|---|---|---|---|---|
| `frus` | Foreign Relations of the United States | 1620-1989 | 311,866 | 750,389 | 190M | 90 |
| `cia` | CIA CREST Collection | 1941-2005 | 935,717 | 12.4M | 1.66B | 120 |
| `cfpf` | State Dept Central Foreign Policy Files | 1973-1979 | 3,214,293 | 3.76M | 444M | 135 |
| `un` | United Nations Archives | 1997-2016 | 192,541 | 943,484 | 259M | 80 |
| `worldbank` | World Bank McNamara Records | 1942-2020 | 128,254 | 128,254 | 29M | 60 |
| `clinton` | Clinton E-Mail | 2009-2013 | 54,149 | -- | 6.5M | 40 |
| `nato` | NATO Archives | 1949-2013 | 46,002 | 281,963 | 107M | 90 |
| `cabinet` | UK Cabinet Papers | 1907-1990 | 42,539 | -- | 111M | 60 |
| `cpdoc` | Azeredo da Silveira Papers | 1973-1979 | 10,279 | -- | 12M | 100 |
| `briefing` | Presidential Daily Briefings | 1946-1977 | 9,680 | 81,633 | 11M | 80 |
| `kissinger` | Kissinger Telephone Conversations | 1973-1976 | 4,552 | -- | 1.7M | 50 |

---

## Query Reference (PostgREST)

### Filtering Operators

All column names can be used as query parameters with these operators:

| Operator | Syntax | Description | Example |
|---|---|---|---|
| `eq` | `col=eq.value` | Equals | `corpus=eq.kissinger` |
| `neq` | `col=neq.value` | Not equals | `corpus=neq.cia` |
| `gt` | `col=gt.value` | Greater than | `authored=gt.1975-01-01` |
| `gte` | `col=gte.value` | Greater than or equal | `word_cnt=gte.3000` |
| `lt` | `col=lt.value` | Less than | `authored=lt.1976-01-01` |
| `lte` | `col=lte.value` | Less than or equal | `authored=lte.1973-06-01` |
| `like` | `col=like.pattern` | Case-sensitive LIKE | `title=like.*CUBA*` |
| `ilike` | `col=ilike.pattern` | Case-insensitive LIKE | `title=ilike.*cuba*` |
| `in` | `col=in.(a,b,c)` | In list | `corpus=in.(kissinger,clinton)` |
| `is` | `col=is.null` | IS NULL | `classification=is.null` |
| `not` | `not.col=eq.value` | Negation prefix | `not.title=ilike.*waldheim*` |
| `fts` | `col=fts.term` | Full-text search (tsquery) | `body=fts.vietnam` |
| `plfts` | `col=plfts.term` | Plain-language FTS | `body=plfts.vietnam+war` |
| `phfts` | `col=phfts.term` | Phrase FTS | `body=phfts.middle+east` |
| `wfts` | `col=wfts.term` | Websearch-style FTS | `body=wfts.vietnam+war` |

### Full-Text Search Details

- **`fts`** uses PostgreSQL tsquery syntax. Multi-word requires operators: `body=fts.vietnam%26war` (& = AND, | = OR, ! = NOT)
- **`plfts`** accepts plain language (spaces OK): `body=plfts.vietnam+war`
- **`phfts`** matches exact phrases: `body=phfts.cuban+missile+crisis`
- **`wfts`** uses Google-like syntax: `body=wfts.vietnam+-cambodia` (- = exclude)
- Language can be specified: `body=fts(english).vietnam`
- FTS works on `body` and `full_text` columns. Does NOT work on `title`.
- Use `ilike` for title search: `title=ilike.*vietnam*`

### Logical Operators

```
# OR
?or=(corpus.eq.kissinger,corpus.eq.clinton)

# AND (explicit)
?and=(corpus.eq.kissinger,authored.gt.1975-01-01)

# Negated OR
?not.or=(title.ilike.*waldheim*,title.ilike.*scowcroft*)

# Multiple filters on same column (implicit AND)
?authored=gte.1975-01-01&authored=lt.1976-01-01
```

### Field Selection

```
?select=doc_id,title,authored,classification
```

### Ordering

```
?order=word_cnt.desc
?order=doc_id.asc
```

**IMPORTANT: Ordering by `authored` requires null handling modifiers or it will timeout:**

```
# These work:
?order=authored.desc.nullslast
?order=authored.asc.nullsfirst

# These TIMEOUT -- do not use:
?order=authored.desc
?order=authored.asc
?order=authored.asc.nullslast
```

Ordering by `doc_id` or `word_cnt` works without null modifiers.

### Pagination

```
# Limit and offset
?limit=10&offset=20

# Range header
Range: 0-24
Range-Unit: items
```

### Count

Use `Prefer: count=exact` header with a `Range` header to get total count in `Content-Range` response header:

```
Content-Range: 0-9/4552
```

### Response Formats

| Accept Header | Format |
|---|---|
| `application/json` (default) | JSON array |
| `text/csv` | CSV with headers |
| `application/vnd.pgrst.object+json` | Single JSON object (use with `limit=1`) |

---

## Example Queries

### Get all corpora with stats
```
GET /corpora
```

### Get total archive statistics
```
GET /totals
```

### Search Kissinger transcripts about Vietnam
```
GET /docs?corpus=eq.kissinger&body=plfts.vietnam&select=doc_id,title,authored&order=authored.asc.nullsfirst
```

### Find top-secret CIA documents mentioning Cuba
```
GET /docs?corpus=eq.cia&classification=eq.top+secret&body=plfts.cuba&limit=10&select=doc_id,title,authored,classification
```

### Get FRUS documents with sender/recipient metadata
```
GET /docs_frus?p_from=ilike.*kissinger*&limit=10&select=doc_id,title,authored,p_from,p_to,location
```

### Find entities matching "Vietnam"
```
GET /entities?entity=ilike.*vietnam*&order=doc_cnt.desc
```

### Get all documents for a specific entity
```
GET /entity_docs?entity_id=eq.315276&limit=50
```

### Get topics for the CIA corpus
```
GET /topics?corpus=eq.cia&order=topic_id.asc
```

### Get top documents for a specific topic
```
GET /topic_docs?corpus=eq.cia&topic_id=eq.5&order=score.desc&limit=10
```

### Get a fully denormalized document (with entities + topics)
```
GET /documents?doc_id=eq.frus1955-57v17d387
```

### Date range query
```
GET /docs?corpus=eq.kissinger&authored=gte.1975-01-01&authored=lt.1976-01-01&select=doc_id,title,authored
```

### Multi-corpus query
```
GET /docs?corpus=in.(kissinger,clinton,briefing)&body=plfts.middle+east&limit=20&select=doc_id,corpus,title,authored
```

### Get decade-level statistics
```
GET /totals_decade?order=decade.asc
```

### Classification distribution (use with external aggregation)
```
GET /docs?corpus=eq.cia&select=classification&limit=1000
```

---

## Gotchas and Known Issues

1. **Ordering by `authored` requires null modifiers.** Use `.desc.nullslast` or `.asc.nullsfirst`. Other combinations timeout.

2. **`fts` requires tsquery syntax.** Spaces between words cause 400 errors. Use `&` for AND (`%26` URL-encoded), `|` for OR. Or use `plfts`/`wfts` for plain language.

3. **`title` is not FTS-indexed.** Use `ilike` for title search, not `fts`.

4. **`entities` has no `corpus` column.** You cannot filter entities by corpus directly. Entities are global. To find corpus-specific entities, join through `entity_docs` -> `docs`.

5. **Some corpora have null `pg_cnt`.** Clinton, Kissinger, Cabinet, and CPDOC have no page count data.

6. **`like` is case-sensitive.** Always use `ilike` unless you specifically need case-sensitive matching.

7. **`full_text` column is a tsvector.** Including it in `select` returns raw tsvector tokens. Exclude it for cleaner results: `select=doc_id,title,authored,body`.

8. **Large result sets.** The CFPF corpus alone has 3.2M docs. Always use `limit` and consider `select` to reduce payload size.

---

## Related Resources

### Official Links
- **History Lab at Columbia:** https://lab.history.columbia.edu/
- **Collections:** https://lab.history.columbia.edu/collections
- **About:** https://lab.history.columbia.edu/about
- **Team:** https://lab.history.columbia.edu/directory

### GitHub Repositories
- **PostgREST API (this API):** https://github.com/history-lab/foiarchive-postgres
- **Python examples:** https://github.com/history-lab/foiarchive-api-python-example
- **Streamlit search GUI:** https://github.com/history-lab/foiarchive-search
- **R client:** https://github.com/history-lab/histlabapi
- **Stata client:** https://github.com/history-lab/hlapiStata
- **Chat agent:** https://github.com/history-lab/chat-agent-historylab
- **All repos:** https://github.com/history-lab

### Dataset
- **Hugging Face:** https://huggingface.co/datasets/HistoryLab/foiarchive (CC-BY-NC-4.0)

### PostgREST Documentation
- **PostgREST docs:** https://postgrest.org/en/v7.0.1/
- **Filtering:** https://postgrest.org/en/v7.0.1/api.html#horizontal-filtering-rows
- **Ordering:** https://postgrest.org/en/v7.0.1/api.html#ordering
- **Pagination:** https://postgrest.org/en/v7.0.1/api.html#limits-and-pagination
- **Full-text search:** https://postgrest.org/en/v7.0.1/api.html#fts
