# History Lab MCP — Search 5M Declassified Documents with AI

I built a tool that lets you search the entire FOI Archive — ~5M declassified documents from the CIA, State Department, FRUS diplomatic records, World Bank, NATO, and more — directly from Claude or from the command line.

## Use It with Claude

Open Claude and add the History Lab MCP server:

1. Go to **Settings > Integrations > Add custom MCP**
2. Enter the URL: `https://mcp.declassification-engine.org/mcp`
3. That's it — Claude now has access to the full archive

Then just ask Claude things like:

- *"Find CIA documents about the Cuban Missile Crisis from October 1962"*
- *"Search for cables from Kissinger to Nixon about Chile in 1973"*
- *"What declassified documents mention nuclear weapons testing in the Pacific?"*
- *"Look up all documents related to the entity 'Fidel Castro'"*

Claude can do semantic search (natural language), full-text search, look up entities, browse topics, and pull up full document text.

## Use It with Claude Code

If you use Claude Code, just ask it to add the MCP server:

> "Add the History Lab MCP server at `https://mcp.declassification-engine.org/mcp`"

Or add it manually to your Claude Code settings.

## CLI (for the technically inclined)

There's also a command-line tool on npm. Install it with:

```bash
npm install -g @history-lab/cli
```

Then search from your terminal:

```bash
# Semantic search
history-lab search "Soviet influence in Latin America"

# Full-text search of CIA documents
history-lab corpus-search --query "cuba" --corpus cia --classification secret

# Kissinger's cables to Nixon in 1973
history-lab frus-search --sender kissinger --recipient nixon --from 1973-01-01 --to 1974-01-01

# Get the full text of a specific document
history-lab document CIA-RDP79T00429A001400010019-1

# Look up people, places, organizations
history-lab entities "Castro"

# Archive stats
history-lab stats
```

All commands support `--json` output for scripting and piping into other tools.

If you want to use the CLI through Claude Code, just ask Claude Code to install it:

> "Install @history-lab/cli globally and use it to search for documents about Vietnam"

## Links

- npm: [npmjs.com/package/@history-lab/cli](https://www.npmjs.com/package/@history-lab/cli)
- Source: [github.com/history-lab/history-lab-mcp](https://github.com/history-lab/history-lab-mcp)
- MCP endpoint: `https://mcp.declassification-engine.org/mcp`
