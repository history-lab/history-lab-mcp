# History Lab MCP

Give AI assistants like Claude direct access to ~5M declassified historical documents — CIA, State Department cables, FRUS diplomatic records, World Bank, NATO, UK Cabinet Papers, and more.

Data from the [FOI Archive](https://foiarchive.org) by [History Lab](https://history-lab.org) at Columbia University.

This project ships three ways to use the same backend:

1. **Remote MCP server** (recommended) — hosted at `mcp.declassification-engine.org`, ready to plug into Claude or any MCP-compatible client.
2. **Local MCP server** — run it over stdio for development or self-hosting.
3. **CLI** — `@history-lab/cli` on npm, for shell scripting and ad-hoc lookups.

---

## MCP Server

The MCP server exposes 9 tools for searching, retrieving, and analyzing declassified documents. It's a [Model Context Protocol](https://modelcontextprotocol.io) server using the Streamable HTTP transport.

**Endpoint:** `https://mcp.declassification-engine.org/mcp`
**Health check:** `https://mcp.declassification-engine.org/health`
**Auth:** none required — the server is public.

### Connect from Claude Code

```bash
claude mcp add --transport http history-lab https://mcp.declassification-engine.org/mcp
```

Then in any Claude Code session, the `history-lab` tools become available. Try:

> Search for CIA documents about the Cuban Missile Crisis and summarize the top three.

### Connect from Claude Desktop

Edit your `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "history-lab": {
      "url": "https://mcp.declassification-engine.org/mcp"
    }
  }
}
```

Restart Claude Desktop. The `history-lab` server should appear under the tools menu.

If your client doesn't support Streamable HTTP transport directly, use the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge:

```json
{
  "mcpServers": {
    "history-lab": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.declassification-engine.org/mcp"]
    }
  }
}
```

### Verify the server is up

```bash
# Health check
curl https://mcp.declassification-engine.org/health
# -> ok

# List available tools
curl -s -X POST https://mcp.declassification-engine.org/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### MCP Tools

| Tool | What it does |
|------|-------------|
| `vector_search` | Semantic search across all ~5M documents using natural language. Returns ranked chunks with relevance scores. Best for conceptual queries. |
| `corpus_search` | Full-text search (PostgreSQL FTS) across documents. Filter by corpus, classification, date range, title. |
| `frus_search` | Search the Foreign Relations of the United States collection (312K docs, 1620–1989) with sender/recipient/location filters. |
| `get_document` | Fetch full text + metadata for a specific document by `doc_id` or vector-search `r2_key`. Optional entity/topic enrichment. |
| `list_corpora` | List all collections with document counts, date ranges, word counts. |
| `entity_lookup` | Find named entities (people, places, orgs) by name. Returns entity IDs + Wikidata links. |
| `entity_documents` | Get all documents associated with a specific entity ID. |
| `browse_topics` | Explore topic models (keyword clusters) per corpus, or fetch top docs for a topic. |
| `archive_stats` | Aggregate stats: totals, breakdowns by decade or classification. |

Each tool ships with detailed descriptions and performance hints embedded in its schema — your AI client will see warnings like "always provide a corpus filter for fast results" and adjust queries accordingly.

### Example prompts

Once connected, try asking your AI assistant:

- *"Find diplomatic cables about Vietnam between 1968 and 1975. Summarize themes."*
- *"What FRUS documents did Kissinger send to Nixon in 1973?"*
- *"Look up the entity 'Pinochet' and pull its top documents."*
- *"Browse topics in the CIA corpus and show me the top documents for the most relevant Cold War topic."*
- *"How many declassified documents are in the archive, broken down by decade?"*

---

## Self-hosting the MCP server

### Run locally over stdio

For development or to integrate with stdio-based MCP clients:

```bash
git clone https://github.com/history-lab/history-lab-mcp
cd history-lab-mcp
npm install
npm run dev:mcp
```

Then point a stdio client at `tsx bin/mcp.ts`:

```json
{
  "mcpServers": {
    "history-lab-local": {
      "command": "tsx",
      "args": ["/absolute/path/to/history-lab-mcp/bin/mcp.ts"]
    }
  }
}
```

### Deploy your own Cloudflare Worker

The hosted server is a Cloudflare Worker (`src/worker/index.ts`). To deploy your own copy:

```bash
npx wrangler deploy
```

See `wrangler.jsonc` for the Worker config and `docs/DEPLOYMENT.md` for full deployment notes.

### Configuration

The server works out of the box with the public corpus API key. Override via environment variables (or Cloudflare Worker secrets):

| Variable | Description |
|---------|-------------|
| `HISTORYLAB_CORPUS_API_URL` | Override the PostgREST corpus API base URL |
| `HISTORYLAB_VECTOR_API_URL` | Override the vector search API URL |
| `HISTORYLAB_VECTOR_API_KEY` | Override the vector API key |
| `CLIENT_API_KEY` | (Worker only) Require `Authorization: Bearer <key>` on incoming MCP requests |

---

## CLI

Same tools, exposed as a shell binary.

### Install

```bash
npm install -g @history-lab/cli
```

Or run directly:

```bash
npx @history-lab/cli search "cuban missile crisis"
```

### Quick examples

```bash
# Semantic vector search
history-lab search "nuclear weapons testing in the Pacific"

# Full-text search in CIA documents
history-lab corpus-search --query "cuban missile crisis" --corpus cia

# Kissinger to Nixon in 1973
history-lab frus-search --sender kissinger --recipient nixon --from 1973-01-01 --to 1974-01-01

# Entity lookup + drill-down
history-lab entities "Castro"

# Full document text
history-lab document CIA-RDP79T00429A001400010019-1

# Archive stats
history-lab stats --decades
```

### Commands

| Command | Purpose |
|---------|---------|
| `search <query>` | Semantic vector search |
| `corpus-search` | Full-text search with filters |
| `frus-search` | FRUS-specific search (sender/recipient/location) |
| `document <id>` | Fetch a document by ID |
| `corpora` | List collections |
| `entities <query>` | Find entities by name |
| `entity-docs <id>` | Documents for an entity |
| `topics <corpus>` | Topic model exploration |
| `stats` | Archive statistics |

Every command supports `--json` (for piping into `jq`) and `--markdown` output. Run `history-lab <command> --help` for full options.

---

## Available Corpora

| ID | Collection | Documents |
|----|-----------|-----------|
| `cia` | CIA CREST | ~936K |
| `cables` | State Department Cables | ~718K |
| `cfpf` | Central Foreign Policy Files | ~3.2M |
| `frus` | Foreign Relations of the US | ~312K |
| `clinton` | Clinton Emails | ~33K |
| `kissinger` | Kissinger Transcripts | ~3K |
| `briefing` | Presidential Daily Briefs | ~12K |
| `nato` | NATO Archives | ~2K |
| `un` | UN Archives | ~5K |
| `worldbank` | World Bank Archives | ~9K |
| `cabinet` | UK Cabinet Papers | ~3K |
| `cpdoc` | CPDOC (Brazil) | varies |

---

## Architecture

```
src/core/       All business logic (clients, types, formatters, config)
src/cli/        CLI adapter (commander.js, thin wrapper over core)
src/mcp/        MCP server adapter (tool definitions, thin wrapper over core)
src/worker/     Cloudflare Worker entrypoint (Streamable HTTP transport)
bin/cli.ts      CLI entrypoint (ships to npm)
bin/mcp.ts      Local MCP stdio entrypoint
```

Core is smart, adapters are dumb — see `CLAUDE.md` and `docs/ARCHITECTURE.md` for details.

## License

MIT
