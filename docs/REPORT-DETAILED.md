# History Lab MCP — Development Report (Detailed)

## What We Built

A unified TypeScript package that makes History Lab's FOI Archive (~5M declassified documents) accessible through three channels:

1. **CLI tool** (`@history-lab/cli` on npm) — command-line search for researchers and developers
2. **Remote MCP server** (Cloudflare Worker at `mcp.declassification-engine.org`) — AI tool use for Claude and other MCP clients
3. **Local MCP server** (stdio) — for development and local Claude Code integration

All three share a single core library with zero code duplication.

---

## Architecture

### Core Library (`src/core/`)

The core library owns all business logic and talks to two upstream APIs:

- **Corpus API** (`api.foiarchive.org`) — PostgREST over PostgreSQL. Handles full-text search, structured queries, entity lookups, topic models, and archive statistics. Public, no auth required.
- **Vector Search API** (`vector-search-worker.nchimicles.workers.dev`) — Custom Cloudflare Worker with Vectorize. Handles semantic/natural language search. Requires API key (now embedded in default config for zero-setup UX).

Key components:
- `corpus-client.ts` (~650 lines) — PostgREST query builder with extensive gotcha protection (null ordering, tsvector exclusion, ilike wrapping)
- `vector-client.ts` (~270 lines) — Vector search with date filter conversion (ISO dates → numeric YYYYMMDD format)
- `postgrest-query.ts` (~145 lines) — Internal query builder that prevents common PostgREST pitfalls
- `search.ts` (~95 lines) — Thin orchestrator that both adapters import
- `formatters.ts` (~310 lines) — Shared markdown/terminal output formatting
- `types.ts` (~240 lines) — All interfaces, enums, error classes

### Adapters

- **CLI** (`src/cli/`, ~320 lines) — 8 commands via Commander.js. Supports `--json`, `--markdown`, and default human-readable output.
- **MCP Server** (`src/mcp/`, ~300 lines) — 8 tools registered on the MCP protocol. Tool descriptions include performance warnings to guide LLM query planning.
- **Worker** (`src/worker/`, ~73 lines) — Cloudflare Worker with SSE streaming transport. Uses service binding to Vector Search Worker for zero-latency internal calls.

### Design Principle

**Adapters are dumb, core is smart.** No API calls, filtering logic, or error handling in adapters. They parse input, call core, format output. That's it.

---

## Performance Work

### Benchmarking

Created `test/benchmark.ts` that tests all endpoints and reports timing + errors. Results from local testing (direct API calls, no Worker overhead):

| Category | Endpoint | Time | Status |
|----------|----------|------|--------|
| Stats | totals, decades, classifications | 20-100ms | Fast |
| Browse | corpora, topics | 20-25ms | Fast |
| Corpus FTS | CIA with query + corpus | 50-120ms | Fast |
| Corpus FTS | CIA with date range | 70-100ms | Fast |
| Corpus FTS | CFPF (3.2M docs) | 150-200ms | OK |
| Corpus FTS | Unfiltered (5M docs) | 1.5-5.6s | Slow but functional |
| FRUS FTS | Query only | 70ms | Fast (after fix) |
| FRUS FTS | Query + sender filter | 115ms | Fast (after fix) |
| FRUS | Sender/recipient without date range | 5-8s | Slow (known, no index) |
| Entity | Lookup + docs | 20-60ms | Fast |
| Vector | Semantic search | ~1.8s | OK |
| Document | Single doc fetch | 20-30ms | Fast |

### Bugs Found & Fixed

#### Bug 1: FRUS Full-Text Search Completely Broken

**Problem:** The `docs_frus` PostgREST view has no `full_text` tsvector column. The code was calling `q.fts('full_text', ...)` on `/docs_frus`, which returned a PostgREST error every time. All FRUS FTS queries were broken.

**Root Cause:** The `full_text` tsvector column only exists on the `/docs` table. The `/docs_frus` view has a `body` text column but no pre-computed tsvector, so `plfts` on body generates tsvectors on-the-fly — too slow for 312K documents.

**Fix:** Implemented a two-step approach in `searchFrusWithFts()`:
1. Search `/docs` table (which has the indexed `full_text` tsvector) filtered to `corpus=frus`
2. Fetch FRUS-specific metadata (sender, recipient, location, chapter, summary) from `/docs_frus` for the returned doc_ids

When FRUS-specific filters (from/to/location) are present alongside FTS, the code over-fetches by 10x from step 1 and applies the FRUS filters server-side on the `/docs_frus` query in step 2, preserving FTS ranking order.

#### Bug 2: Title-Only Search Timeouts

**Problem:** `ilike` on the `title` column does a sequential scan with no index. On CIA (936K docs) this takes 16+ seconds and on the full archive (5M docs) it times out at 30s.

**Fix:** Added a guard in `searchDocs()` that rejects title-only searches (no FTS query). The error message guides users to combine title search with a full-text query for fast results. This is enforced at the API layer so both CLI and MCP get the protection.

#### Bug 3: Custom Domain 403 Errors

**Problem:** `mcp.declassification-engine.org` was returning 403 for non-browser clients. Cloudflare Bot Fight Mode was blocking programmatic MCP access.

**Status:** Resolved — the custom domain now returns 200 for all clients.

### Performance Optimizations

1. **Default timeout reduced** from 30s to 15s (`config.ts`). 30s is too long for interactive use — better to fail fast and let users refine their query.

2. **Tool descriptions updated** with `SLOW QUERY WARNINGS` sections in both `corpus_search` and `frus_search` MCP tools. Parameter descriptions include `WARNING` and `RECOMMENDED` hints so LLMs naturally avoid slow patterns (e.g., always provide corpus filter, combine sender with date range).

---

## npm Publishing

### Package: `@history-lab/cli`

Published under the `@history-lab` npm organization.

**What ships:**
- `src/cli/` — CLI commands
- `src/core/` — Shared core library
- `bin/cli.ts` — Entrypoint

**What doesn't ship:**
- `src/mcp/` — MCP server (deploys via Cloudflare Worker)
- `src/worker/` — Cloudflare Worker code
- `bin/mcp.ts` — Local MCP entrypoint
- `@modelcontextprotocol/sdk` — Moved to devDependencies

**Runtime dependencies:** `commander` + `dotenv` (2 deps, ~60KB)

**Package size:** 30KB packed, 142KB unpacked

### Zero-Config UX

The public vector API key (`historylab-public-api-2026`) is embedded in the default config. All commands work immediately with no environment variables or setup:

```bash
npx @history-lab/cli search "Cuban Missile Crisis"
npx @history-lab/cli corpus-search --query "vietnam" --corpus cia
npx @history-lab/cli frus-search --sender kissinger --from 1973-01-01 --to 1974-01-01
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `search <query>` | Semantic vector search (natural language) |
| `corpus-search` | Full-text search with corpus/classification/date filters |
| `frus-search` | FRUS diplomatic records (sender/recipient/location) |
| `document <id>` | Fetch full text of a document |
| `corpora` | List all document collections |
| `entities <query>` | Entity lookup (people, places, orgs) |
| `entity-docs <id>` | Documents for a specific entity |
| `topics <corpus>` | Browse topic models |
| `stats` | Archive statistics |

All commands support `--json` and `--markdown` output formats.

---

## Deployment Summary

| Channel | URL / Command | Status |
|---------|--------------|--------|
| npm CLI | `npx @history-lab/cli` | Published v0.1.1 |
| Remote MCP | `mcp.declassification-engine.org/mcp` | Deployed |
| GitHub | `github.com/history-lab/history-lab-mcp` | Pushed |

---

## Known Limitations

1. **Title ilike has no database index** — title-only search is blocked, must combine with FTS query
2. **FRUS sender/recipient ilike is slow (~5-8s)** without date range — no database index on `p_from`/`p_to`
3. **Unfiltered FTS across 5M docs** takes 3-8s — recommend always providing corpus filter
4. **CFPF corpus** (3.2M docs) is inherently slow for FTS
5. **FRUS FTS + sender/recipient filter** may return fewer results than expected because the two-step approach fetches a limited window from FTS then filters by sender
6. **Cold start** on the Cloudflare Worker adds ~4s to the first request
