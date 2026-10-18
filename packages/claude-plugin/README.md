# Ripple plugin for Claude

Adds one MCP tool, `ripple_render`. Claude writes a Ripple spec and the card shows up inside the chat as a live, clickable view: charts, tables, mermaid diagrams, LaTeX math.

It uses MCP Apps, so it only renders in hosts that support them (the Claude desktop app and claude.ai). In a plain terminal the tool still runs, but you only see a one-line text result.

## Install

```
/plugin marketplace add qbtrix/ripple-iui
/plugin install ripple@ripple-iui
```

Optional: also install the authoring skill so Claude knows every widget.

```
npx skills add qbtrix/ripple-iui --skill ripple
```

## How it works

`server/ripple-mcp.mjs` is a small stdio MCP server with no dependencies. The tool links the `ui://ripple/card.html` resource. The host loads that page in a sandboxed frame and sends it the tool input. The page imports the Ripple embed bundle from jsDelivr and mounts the card in a shadow root. Set `RIPPLE_EMBED_URL` to load the bundle from somewhere else.
