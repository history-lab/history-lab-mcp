# @history-lab/cli

Search ~5M declassified historical documents from the command line. CIA, State Department cables, FRUS diplomatic records, World Bank, NATO, and more.

Data from the [FOI Archive](https://foiarchive.org) by [History Lab](https://history-lab.org) at Columbia University.

## Install

```bash
npm install -g @history-lab/cli
```

Or run directly:

```bash
npx @history-lab/cli corpus-search --query "cuban missile crisis" --corpus cia
```

## Quick Start

All commands work immediately with no setup.

```bash
# Semantic search using natural language
history-lab search "nuclear weapons testing in the Pacific"

# Search CIA documents about the Cuban Missile Crisis
history-lab corpus-search --query "cuban missile crisis" --corpus cia

# Find Kissinger's cables to Nixon in 1973
history-lab frus-search --sender kissinger --recipient nixon --from 1973-01-01 --to 1974-01-01

# Look up entities
history-lab entities "Castro"

# Get full text of a document
history-lab document CIA-RDP79T00429A001400010019-1

# Archive statistics
history-lab stats
```

## Commands

### `search <query>` — Semantic vector search

Natural language search across all documents.

```bash
history-lab search "Soviet influence in Latin America" --limit 20
history-lab search "diplomatic cables about Vietnam" --from 1968 --to 1975
```

| Option | Description |
|--------|-------------|
| `-n, --limit <n>` | Number of results (1-100, default 10) |
| `--from <date>` | Start date (YYYY, YYYY-MM, or YYYY-MM-DD) |
| `--to <date>` | End date |

### `corpus-search` — Full-text search

Structured search using PostgreSQL full-text search. No API key needed.

```bash
history-lab corpus-search --query "cuba" --corpus cia --classification secret
history-lab corpus-search --query "vietnam war" --corpus cables --from 1968-01-01 --to 1969-01-01
```

| Option | Description |
|--------|-------------|
| `-q, --query <text>` | Full-text search query |
| `-t, --title <text>` | Title search (case-insensitive) |
| `-c, --corpus <id>` | Filter by collection (see `corpora` command) |
| `--classification <level>` | Security classification filter |
| `--from <date>` | Start date (ISO format) |
| `--to <date>` | End date |
| `--fts-mode <mode>` | plfts (default), phfts (exact phrase), wfts (websearch) |
| `-n, --limit <n>` | Max results (default 25) |
| `--offset <n>` | Pagination offset |
| `--body` | Include document body text |

### `frus-search` — FRUS diplomatic records

Search the Foreign Relations of the United States collection (312K documents, 1620-1989). Includes sender, recipient, and location metadata.

```bash
history-lab frus-search --query "Chile coup" --sender kissinger
history-lab frus-search --sender kissinger --recipient nixon --from 1973-01-01 --to 1974-01-01
```

| Option | Description |
|--------|-------------|
| `-q, --query <text>` | Full-text search query |
| `--sender <name>` | Sender name |
| `--recipient <name>` | Recipient name |
| `--location <place>` | Where the document was authored |
| `--from <date>` | Start date |
| `--to <date>` | End date |
| `--classification <level>` | Classification filter |
| `-n, --limit <n>` | Max results (default 25) |

### `document <id>` — Fetch a document

```bash
history-lab document CIA-RDP79T00429A001400010019-1
history-lab document CIA-RDP79T00429A001400010019-1 --enriched  # includes entities and topics
```

### `corpora` — List collections

```bash
history-lab corpora
```

Shows all available document collections with document counts, date ranges, and word counts.

### `entities <query>` — Entity lookup

```bash
history-lab entities "Castro"
history-lab entities "Vietnam" --group LOC
```

| Option | Description |
|--------|-------------|
| `-g, --group <type>` | Filter: PERSON, LOC, ORG, or OTHER |
| `-n, --limit <n>` | Max results (default 25) |

### `entity-docs <entityId>` — Documents for an entity

```bash
history-lab entity-docs 12345 --limit 10
```

### `topics <corpus>` — Topic models

```bash
history-lab topics cia                    # list all topics
history-lab topics cia --topic-id 5       # top documents for topic 5
```

### `stats` — Archive statistics

```bash
history-lab stats                     # total docs, pages, words
history-lab stats --decades           # breakdown by decade
history-lab stats --classifications   # breakdown by classification level
```

## Output Formats

All commands support three output formats:

```bash
history-lab corpus-search --query "cuba" --corpus cia            # human-readable (default)
history-lab corpus-search --query "cuba" --corpus cia --json     # JSON (for scripting)
history-lab corpus-search --query "cuba" --corpus cia --markdown # Markdown
```

Use `--json` to pipe into `jq` or other tools:

```bash
history-lab corpus-search --query "cuba" --corpus cia --json | jq '.[0].title'
```

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

## Configuration

All commands work out of the box with no configuration. Advanced users can override the default API endpoints:

| Environment Variable | Description |
|---------------------|-------------|
| `HISTORYLAB_CORPUS_API_URL` | Override corpus API URL |
| `HISTORYLAB_VECTOR_API_URL` | Override vector API URL |
| `HISTORYLAB_VECTOR_API_KEY` | Override vector API key |

## MCP Server

For AI tool use (Claude, etc.), this project also provides a remote MCP server:

```
https://mcp.declassification-engine.org/mcp
```

See the [repository](https://github.com/history-lab/history-lab-mcp) for MCP setup instructions.

## License

MIT
