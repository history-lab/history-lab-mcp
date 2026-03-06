# History Lab MCP — Summary Report

## What It Is

A single TypeScript codebase that makes the FOI Archive searchable through three channels:

- **CLI tool** — `npx @history-lab/cli search "Cuban Missile Crisis"` (on npm, zero setup)
- **Remote MCP server** — AI agents (Claude, etc.) connect to `mcp.declassification-engine.org/mcp`
- **Programmatic library** — `import { HistoryLabSearch } from "@history-lab/cli"`

## What It Can Do

9 commands / tools covering the full FOI Archive API surface:

| Capability | Example |
|-----------|---------|
| Semantic search | `search "Soviet influence in Latin America"` |
| Full-text search | `corpus-search --query "cuba" --corpus cia --classification secret` |
| FRUS diplomatic search | `frus-search --sender kissinger --recipient nixon --from 1973-01-01 --to 1974-01-01` |
| Document retrieval | `document CIA-RDP79T00429A001400010019-1` |
| Entity lookup | `entities "Castro"` |
| Topic browsing | `topics cia` |
| Collection listing | `corpora` |
| Archive statistics | `stats` |

All commands support `--json` and `--markdown` output.

## What We Fixed

- **FRUS full-text search was completely broken** — the database view was missing the search index column. Implemented a two-step query that uses the indexed table then enriches with FRUS metadata.
- **Title-only searches caused 30s timeouts** — no database index on title. Added a guard that requires combining title with a full-text query.
- **Custom domain was blocking non-browser clients** (403 errors) — resolved.
- **Reduced default timeout** from 30s to 15s for better interactive UX.
- **Added performance guidance** to MCP tool descriptions so AI agents avoid slow query patterns.

## Where It Lives

| What | Where |
|------|-------|
| npm package | [@history-lab/cli](https://www.npmjs.com/package/@history-lab/cli) (v0.1.1) |
| MCP endpoint | `mcp.declassification-engine.org/mcp` |
| Source code | [github.com/history-lab/history-lab-mcp](https://github.com/history-lab/history-lab-mcp) |

## Tech Stack

- TypeScript, Node 18+
- Cloudflare Workers (MCP server deployment)
- PostgREST (corpus API client)
- Custom vector search (semantic embeddings)
- 2 runtime dependencies: `commander`, `dotenv`

## Known Limitations

- Sender/recipient search on FRUS is slow (~5-8s) without a date range filter (no database index)
- Unfiltered full-text search across all 5M docs takes 3-8s (recommend always providing a corpus filter)
- The CFPF corpus (3.2M docs) is the slowest to search
