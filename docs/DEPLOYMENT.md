# History Lab MCP — Part 2: Remote Deployment on Cloudflare Workers

Extends [ARCHITECTURE.md](./ARCHITECTURE.md) with the remote deployment layer.

---

## Overview

The MCP server runs in two modes from the same codebase:

| Mode | Transport | How clients connect | Use case |
|------|-----------|-------------------|----------|
| **Local** | stdio | Claude Code spawns process locally | Personal use, development |
| **Remote** | SSE / Streamable HTTP | Any MCP client connects via URL | Public/shared access, no install needed |

The core library and tool definitions are **identical** in both modes. Only the entrypoint differs.

---

## What Gets Added to the Repo

```
history-lab-mcp/
├── src/
│   ├── core/              # unchanged
│   ├── mcp/
│   │   ├── tools/         # unchanged — same tool definitions
│   │   └── server.ts      # unchanged — creates MCP server, registers tools
│   ├── cli/               # unchanged
│   └── worker/            # NEW
│       └── index.ts       # CF Worker entrypoint
│
├── bin/
│   ├── mcp.ts             # Local stdio entrypoint
│   └── cli.ts             # CLI entrypoint
│
├── wrangler.jsonc          # NEW — Worker configuration
└── package.json
```

---

## How the Transport Split Works

### `src/mcp/server.ts` — Transport-Agnostic

The MCP server is created without any transport attached. It just registers tools.

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerAllTools } from "./tools/index.js"
import { HistoryLabSearch } from "../core/search.js"

export function createServer(config: HistoryLabConfig): McpServer {
  const search = new HistoryLabSearch(config)
  const server = new McpServer({
    name: "history-lab",
    version: "1.0.0",
  })

  registerAllTools(server, search)
  return server
}
```

### `bin/mcp.ts` — Local (stdio)

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createServer } from "../src/mcp/server.js"
import { loadConfig } from "../src/core/config.js"

const server = createServer(loadConfig())
const transport = new StdioServerTransport()
await server.connect(transport)
```

### `src/worker/index.ts` — Remote (Cloudflare Worker)

```ts
import { McpAgent } from "agents/mcp"
import { createServer } from "../mcp/server.js"
import { loadConfig } from "../core/config.js"

export class HistoryLabMCP extends McpAgent {
  server = createServer(loadConfig({
    vectorApiKey: this.env.HISTORYLAB_VECTOR_API_KEY,
  }))
}

export default {
  fetch(request: Request, env: Env) {
    // Route /sse and /mcp to the MCP agent
    // Everything else returns 404
    return HistoryLabMCP.serve("/sse").fetch(request, env)
  }
}
```

> Note: Cloudflare's `agents/mcp` package (part of the Agents SDK) handles the
> SSE transport, session management, and protocol negotiation automatically.
> If the Agents SDK doesn't fit, the alternative is using
> `SSEServerTransport` from the MCP SDK directly with a standard Worker fetch handler.

---

## Wrangler Configuration

```jsonc
// wrangler.jsonc
{
  "name": "history-lab-mcp",
  "main": "src/worker/index.ts",
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat"],

  // Secrets (set via `wrangler secret put`)
  // HISTORYLAB_VECTOR_API_KEY — Bearer token for vector search API

  // No KV/D1/R2 needed — this worker is stateless,
  // it proxies to the existing History Lab APIs
}
```

---

## Auth Strategy for the Remote Worker

The Worker sits between public clients and the History Lab APIs. Two layers of auth:

### 1. Upstream Auth (Worker → History Lab APIs)

- **Vector API**: Worker holds the API key as a Cloudflare secret (`HISTORYLAB_VECTOR_API_KEY`). Clients never see it.
- **Corpus API**: Public, no auth needed.

### 2. Client Auth (MCP Clients → Worker)

Options, simplest first:

| Approach | Complexity | When to use |
|----------|-----------|-------------|
| **Open** | None | Early development, trusted users |
| **Shared API key** | Low | Small team, header-based `Authorization: Bearer <key>` |
| **OAuth / CF Access** | Medium | Production, user-level access control |

Start open or with a shared key. Add proper auth later if needed.

For shared key auth, the Worker validates a header before processing:

```ts
export default {
  async fetch(request: Request, env: Env) {
    // Simple API key gate
    const authHeader = request.headers.get("Authorization")
    if (env.CLIENT_API_KEY && authHeader !== `Bearer ${env.CLIENT_API_KEY}`) {
      return new Response("Unauthorized", { status: 401 })
    }

    return HistoryLabMCP.serve("/sse").fetch(request, env)
  }
}
```

---

## Client Configuration

### Claude Code (remote)

```json
// .claude/settings.json
{
  "mcpServers": {
    "history-lab": {
      "url": "https://history-lab-mcp.nchimicles.workers.dev/sse"
    }
  }
}
```

### Claude Code (local, for development)

```json
// .claude/settings.json
{
  "mcpServers": {
    "history-lab": {
      "command": "npx",
      "args": ["history-lab-mcp"],
      "env": {
        "HISTORYLAB_VECTOR_API_KEY": "your-key"
      }
    }
  }
}
```

### Any MCP Client

The remote URL works with any MCP-compatible client (Claude Desktop, Cursor, custom apps). They just point at the Worker URL.

---

## Deployment Workflow

```bash
# 1. Set secrets (one time)
wrangler secret put HISTORYLAB_VECTOR_API_KEY

# 2. Deploy
wrangler deploy

# 3. Test
curl https://history-lab-mcp.nchimicles.workers.dev/sse
```

---

## Build Order (Updated from Part 1)

1. Core types + config
2. Vector client
3. Corpus client
4. Search orchestrator
5. Formatters
6. **MCP server (transport-agnostic)** — register tools, no transport
7. **Local stdio entrypoint** — wire server to stdio, test with Claude Code
8. CLI commands
9. **Worker entrypoint** — wire same server to SSE transport
10. **Deploy to Cloudflare** — `wrangler deploy`
11. Test remote access from Claude Code

Steps 7-8 can run in parallel. Step 9 is ~30 min of work once step 7 is verified.

---

## What Stays the Same vs. What Changes

| Layer | Local | Remote | Shared? |
|-------|-------|--------|---------|
| Core library | Yes | Yes | 100% shared |
| Tool definitions | Yes | Yes | 100% shared |
| MCP server creation | Yes | Yes | 100% shared |
| Transport | stdio | SSE/HTTP | Different — ~20 lines each |
| Config loading | `process.env` | `env` binding | Small adapter |
| Auth (upstream) | Env var | CF secret | Same key, different source |
| Auth (client) | N/A (local) | API key / CF Access | Remote only |
