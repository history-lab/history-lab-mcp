# History Lab MCP

## Project Overview

TypeScript monorepo that exposes History Lab's FOI Archive (~5M declassified documents) through three channels from one codebase:

- **CLI** (`@history-lab/cli` on npm) — `history-lab search "Cuba"`
- **Remote MCP server** (Cloudflare Worker) — `mcp.declassification-engine.org/mcp`
- **Local MCP server** (stdio) — for development

## Architecture

```
src/core/       → All business logic (clients, types, formatters, config)
src/cli/        → CLI adapter (commander.js, thin wrapper over core)
src/mcp/        → MCP server adapter (tool registration, thin wrapper over core)
src/worker/     → Cloudflare Worker entrypoint (SSE transport)
bin/cli.ts      → CLI entrypoint (ships to npm)
bin/mcp.ts      → Local MCP stdio entrypoint (dev only)
test/           → Benchmark script
```

**Principle: Core is smart, adapters are dumb.** No API calls or business logic in adapters.

## Two APIs

1. **Corpus API** (PostgREST, public) — `https://api.foiarchive.org` — FTS, structured queries, entities, topics, stats
2. **Vector API** (custom Worker, requires key) — semantic search with embeddings

The public API key `historylab-public-api-2026` is embedded in the default config.

## Key Files

- `src/core/corpus-client.ts` — PostgREST client, largest file (~650 lines)
- `src/core/vector-client.ts` — Vector search client
- `src/core/search.ts` — Thin orchestrator both adapters use
- `src/core/formatters.ts` — Shared markdown/terminal formatting
- `src/core/postgrest-query.ts` — Internal query builder with PostgREST gotcha protections
- `src/mcp/server.ts` — MCP tool definitions with performance warnings in descriptions
- `src/cli/index.ts` — All 8 CLI commands

## Known Performance Constraints

- **Title-only search is blocked** — `ilike` on title has no index, times out on large corpora. Code throws an error requiring a FTS query alongside title search.
- **FRUS FTS uses two-step approach** — `docs_frus` table has no `full_text` tsvector. We search `/docs` (indexed) with `corpus=frus`, then fetch FRUS metadata from `/docs_frus`.
- **Sender/recipient ilike is slow (~5s)** without date range filters on FRUS (312K docs, no index).
- **Unfiltered FTS across all 5M docs** takes 3-8s. Always recommend corpus filter.
- **CFPF corpus** (3.2M docs) is the slowest to search.
- Default timeout is 15s.

## PostgREST Gotchas (in postgrest-query.ts)

- `authored` ordering MUST include null modifiers (`nullslast`/`nullsfirst`) or queries timeout
- `full_text` column must never appear in `select` (returns raw tsvector tokens, not useful)
- `ilike` auto-wraps patterns in `*wildcards*`

## Build & Deploy

```bash
npm run build          # tsc → dist/
npm run dev:cli        # tsx bin/cli.ts (dev mode)
npm run dev:mcp        # tsx bin/mcp.ts (local MCP)
npx wrangler deploy    # Deploy Worker to Cloudflare
npm publish --access public  # Publish CLI to npm (@history-lab/cli)
```

## npm Package (`@history-lab/cli`)

Only ships `src/cli/` + `src/core/` + `bin/cli.ts`. MCP and Worker code excluded via `files` field. Runtime deps: `commander` + `dotenv` only.

## Testing

```bash
npx tsx test/benchmark.ts   # Benchmarks all endpoints, reports timing + errors
```

## Corpora

cia (936K), cables (718K), cfpf (3.2M), frus (312K), clinton (33K), kissinger (3K), briefing (12K), nato (2K), un (5K), worldbank (9K), cabinet (3K), cpdoc
