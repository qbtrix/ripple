# @ripple-ui/mcp

An MCP server that lets any agent answer with a live Ripple card instead of a
wall of text. It has one tool, `ripple_render`. The agent writes a small
Ripple JSON spec (a chart, a table, a diagram, a dashboard) and the card shows
up inline in the chat.

It uses [MCP Apps](https://github.com/modelcontextprotocol/ext-apps): the tool
points at a `ui://ripple/card.html` resource, and the host draws that page in a
sandboxed frame. The page loads
[`@ripple-ui/embed`](https://www.npmjs.com/package/@ripple-ui/embed) from
jsDelivr at a pinned version. Hosts that don't support MCP Apps yet still get
the tool's short text reply, so nothing breaks there; you just don't see a
card.

No dependencies. It runs on Node 18 or newer.

## Install

### Claude Code

```bash
claude mcp add ripple -- npx -y @ripple-ui/mcp
```

Add `--scope user` to have it in every project.

### Claude Desktop

Open `claude_desktop_config.json` (Settings → Developer → Edit Config) and add:

```json
{
  "mcpServers": {
    "ripple": {
      "command": "npx",
      "args": ["-y", "@ripple-ui/mcp"]
    }
  }
}
```

Restart Claude Desktop.

### Cursor

Add this to `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` for
every project:

```json
{
  "mcpServers": {
    "ripple": {
      "command": "npx",
      "args": ["-y", "@ripple-ui/mcp"]
    }
  }
}
```

Any other MCP client works the same way: run `npx -y @ripple-ui/mcp` over
stdio.

## Try it

Ask for something visual: "show last quarter's revenue by month as a chart",
"compare these three plans in a table". The agent calls `ripple_render` with a
spec like this:

```json
{
  "version": "1.0",
  "ui": {
    "type": "card",
    "props": { "title": "Revenue" },
    "children": [{ "type": "metric", "props": { "label": "Q3", "value": "$12k" } }]
  }
}
```

Widget types and props are in the [Ripple docs](https://ripple.pocketpaw.xyz/docs).
For better specs, give your agent the [Ripple skill](https://github.com/qbtrix/ripple/tree/main/skills/ripple) too.

## Options

| Env var | What it does |
|---|---|
| `RIPPLE_EMBED_URL` | Load the embed from somewhere else, such as a self-hosted copy. If it's on another origin, the host's CSP for the card will block it. |

## Develop

```bash
cd packages/mcp
bun run test     # node --test, drives the real server over stdio
```
