# History Lab MCP — Part 3: npm Publishing & CLI Distribution

Extends [ARCHITECTURE.md](./ARCHITECTURE.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Overview

The package is published to npm as a single package that serves three purposes:

```
npm install -g history-lab        # CLI tool
npx history-lab search "query"    # CLI without install
npx history-lab-mcp               # Local MCP server for Claude Code
```

One package, one install, both entry points.

---

## Package Identity

```jsonc
{
  "name": "history-lab",
  "version": "1.0.0",
  "description": "Search ~5M declassified historical documents. CLI tool and MCP server for the History Lab / FOI Archive.",
  "license": "MIT",
  "author": "nchimicles",
  "repository": {
    "type": "git",
    "url": "https://github.com/nchimicles/history-lab-mcp"
  },
  "keywords": [
    "history",
    "declassified",
    "foia",
    "mcp",
    "cli",
    "search",
    "cia",
    "cold-war",
    "diplomacy",
    "archives"
  ]
}
```

> Package name `history-lab` is clean and short. If taken, fallback to `@historylab/cli` or `historylab`.

---

## Bin Entries

Two executable commands from one package:

```jsonc
{
  "bin": {
    "history-lab": "./dist/bin/cli.js",
    "history-lab-mcp": "./dist/bin/mcp.js"
  }
}
```

| Command | What it does |
|---------|-------------|
| `history-lab` | CLI tool — interactive search, document retrieval |
| `history-lab-mcp` | MCP server — stdio transport for Claude Code / Claude Desktop |

Both bin files need the shebang:

```ts
#!/usr/bin/env node
```

---

## Package Exports

For anyone importing the core library programmatically:

```jsonc
{
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/src/index.js",
      "types": "./dist/src/index.d.ts"
    }
  }
}
```

This allows:

```ts
import { HistoryLabSearch } from "history-lab"
```

Keep exports minimal. Don't expose `./mcp` or `./cli` sub-paths — those are internal. The public API is just the core library.

---

## What Gets Published (and What Doesn't)

### `files` field in package.json

```jsonc
{
  "files": [
    "dist/",
    "README.md",
    "LICENSE"
  ]
}
```

### `.npmignore` (belt and suspenders)

```
src/
docs/
tasks/
wrangler.jsonc
.env*
.claude/
node_modules/
tsconfig.json
*.ts
!*.d.ts
```

Source TypeScript is excluded — only compiled JS + declaration files ship.
The Worker entrypoint (`src/worker/`) is excluded since it deploys separately via Wrangler.

---

## Build & Publish Scripts

```jsonc
{
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build",
    "dev:mcp": "tsx bin/mcp.ts",
    "dev:cli": "tsx bin/cli.ts"
  }
}
```

`prepublishOnly` ensures a fresh build before every publish. No stale dist.

---

## Publishing Workflow

```bash
# 1. Bump version
npm version patch   # or minor/major

# 2. Publish
npm publish

# 3. Verify
npx history-lab --version
npx history-lab search "Cuban Missile Crisis"
npx history-lab-mcp --help
```

---

## CLI UX for npm Users

### First Run Experience

When a user runs `npx history-lab search "query"` for the first time:

1. Vector search requires an API key — the CLI checks for `HISTORYLAB_VECTOR_API_KEY` env var
2. If missing, it prints a clear message:

```
History Lab — Search ~5M declassified documents

Vector search requires an API key.
Set it via: export HISTORYLAB_VECTOR_API_KEY=your-key

Corpus search (structured queries) works without a key.
Try: history-lab corpus-search --corpus cia --title "*cuba*"

Get an API key at: https://historylab.org/api
```

3. Corpus search commands work immediately with no config (public API)

### Help Output

```
$ history-lab --help

Usage: history-lab <command> [options]

Search ~5M declassified historical documents from the FOI Archive.

Commands:
  search <query>        Semantic search using natural language
  corpus-search         Structured search by corpus, title, classification
  document <id>         Fetch full text of a document
  corpora               List available document collections
  entities <query>      Look up named entities (people, places, orgs)
  topics <corpus>       Browse topic models for a corpus

Options:
  --version             Show version
  --help                Show help

Examples:
  history-lab search "Cuban Missile Crisis" --from 1962-10 --to 1962-11
  history-lab corpus-search --corpus cia --classification secret --limit 20
  history-lab entities "Kissinger"
  history-lab document CIA-RDP79T00429A001400010019-1
```

### Output Formats

```bash
history-lab search "query"                # Default: human-readable terminal output
history-lab search "query" --json         # JSON output (for piping/scripting)
history-lab search "query" --markdown     # Markdown output
```

The `--json` flag is important for scriptability — lets users pipe results into `jq`, other tools, or their own scripts.

---

## Version Strategy

- Start at `0.1.0` — signals early/beta
- Semantic versioning: breaking changes to CLI flags or core library API bump major
- MCP tool schema changes are breaking (clients may depend on them)
- Adding new tools/commands is minor
- Bug fixes are patch

---

## README for npm

The npm README should cover (in this order):

1. One-line description
2. Quick start (3 commands max)
3. Available commands with examples
4. MCP server setup (Claude Code config snippet)
5. API key setup
6. Link to full docs

Keep it scannable. Users should go from `npm install` to results in under 60 seconds.

---

## Dependency Hygiene

Final dependency list for the published package:

| Dependency | Purpose | Size |
|------------|---------|------|
| `@modelcontextprotocol/sdk` | MCP protocol | Required |
| `commander` | CLI arg parsing | ~50KB |
| `dotenv` | Env file loading | ~10KB |

No dev dependencies ship (they're in `devDependencies`):

| Dev Dependency | Purpose |
|----------------|---------|
| `typescript` | Build |
| `tsx` | Dev mode (run .ts directly) |
| `@types/node` | Type definitions |

Three production dependencies. The package stays lean.

---

## Updated Build Order (Final)

1. Core types + config
2. Vector client
3. Corpus client
4. Search orchestrator
5. Formatters (markdown, terminal, JSON)
6. MCP server (transport-agnostic tool registration)
7. Local stdio entrypoint — test with Claude Code
8. CLI commands + `--json` / `--markdown` flags
9. **package.json bin/exports/files** — verify `npx` works locally
10. Worker entrypoint — wire to SSE transport
11. Deploy Worker to Cloudflare
12. **`npm publish`** — verify `npx history-lab` works globally
13. Write README

---

## Summary: Three Distribution Channels, One Codebase

| Channel | Command | What ships |
|---------|---------|-----------|
| **npm CLI** | `npx history-lab search "query"` | CLI commands |
| **npm MCP** | `npx history-lab-mcp` (local stdio) | MCP server for Claude Code |
| **Cloudflare** | `https://history-lab-mcp.workers.dev/sse` | Remote MCP server for any client |

All three share the same core library, same tool definitions, same formatters.
