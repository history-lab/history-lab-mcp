import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createServer } from '../mcp/server.js'
import { loadConfig } from '../core/config.js'

interface Env {
  HISTORYLAB_VECTOR_API_KEY: string
  CLIENT_API_KEY?: string
  VECTOR_SEARCH: { fetch: typeof fetch }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 })
    }

    // Only handle /mcp path
    if (url.pathname !== '/mcp') {
      return new Response(JSON.stringify({
        name: 'history-lab-mcp',
        version: '0.1.0',
        description: 'MCP server for searching ~5M declassified historical documents',
        mcp_endpoint: '/mcp',
        health_endpoint: '/health',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Optional client auth
    if (env.CLIENT_API_KEY) {
      const auth = request.headers.get('Authorization')
      if (auth !== `Bearer ${env.CLIENT_API_KEY}`) {
        return new Response('Unauthorized', { status: 401 })
      }
    }

    // Create config with service binding for worker-to-worker calls
    const config = loadConfig({
      vectorApiKey: env.HISTORYLAB_VECTOR_API_KEY,
      vectorFetch: env.VECTOR_SEARCH.fetch.bind(env.VECTOR_SEARCH),
    })

    const server = createServer(config)
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    })

    await server.connect(transport)

    return transport.handleRequest(request)
  },
}
