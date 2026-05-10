# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

```bash
npm run build    # Compile TypeScript to build/
npm run dev      # Watch mode compilation
npm start        # Run compiled server (node build/index.js)
```

No test framework is configured.

## Architecture

Single-file MCP server (`src/index.ts`, ~470 lines) that bridges AI assistants with arXiv. Published as `@qiyuany/arxiv-paper-mcp` on npm. Communicates via stdio transport.

**Four MCP tools exposed:**
- `search_arxiv` — keyword search via `@agentic/arxiv`
- `get_recent_papers` — fetches recent papers from specified arXiv category
- `get_arxiv_pdf_url` — converts arXiv ID/URL to PDF download link
- `parse_paper_content` — extracts full paper text (HTML-first, PDF fallback)

**Content extraction pipeline:** Tries fetching the HTML version from `arxiv.org/html/{id}` first (parsed with jsdom). Falls back to downloading the PDF and extracting text with `pdf-parse`. Temp PDF files are cleaned up in `finally` blocks.

**Key dependencies:** `@modelcontextprotocol/sdk`, `@agentic/arxiv`, `axios`, `jsdom`, `pdf-parse`

## Key Patterns

- arXiv IDs are normalized by stripping version suffixes (e.g. `2403.15137v1` → `2403.15137`)
- Network requests have 20-30s timeouts via axios
- All async functions use try-catch with context-specific error messages
- MCP tool registration follows the SDK pattern: `ListToolsRequestSchema` for tool definitions, `CallToolRequestSchema` for execution routing
