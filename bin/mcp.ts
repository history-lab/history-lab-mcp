#!/usr/bin/env node

import 'dotenv/config'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from '../src/mcp/server.js'
import { loadConfig } from '../src/core/config.js'

const server = createServer(loadConfig())
const transport = new StdioServerTransport()
await server.connect(transport)
