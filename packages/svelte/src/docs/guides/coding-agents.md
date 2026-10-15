---
title: Coding agents
description: Install the Ripple skill so Claude Code, Codex or OpenCode write a card, render it, audit their own screenshots and fix it before you see it.
order: 6
---

The Ripple skill teaches a coding agent to write Ripple specs the way a careful person would: pick the right widget, fill it with real data, then look at the result and fix what is wrong. It lives in the repo at [`skills/ripple`](https://github.com/qbtrix/ripple-iui/tree/main/skills/ripple) and installs with the [skills CLI](https://github.com/vercel-labs/skills).

## Install

```bash
npx skills add qbtrix/ripple-iui --skill ripple
```

Add `-g` to install it for your user instead of one project, and `-a claude-code`, `-a codex` or `-a opencode` to pick the agent. Then ask for a card as usual ("a bill splitter for four", "a pricing table for my app"); the agent loads the skill when the request is about a Ripple spec.

The loop renders through a real browser, so the project you work in needs Playwright with Chromium:

```bash
npm i -D playwright && npx playwright install chromium
npm i -D axe-core   # optional, adds accessibility counts
```

## What the loop does

1. **Choose.** The agent looks the request up in a map of intent to widget (a trip is an `itinerary`, a split bill a `bill-split`) and writes down which widget and why before any JSON.
2. **Write.** It writes the spec with only the props that widget takes. A test in this repo fails when the map and the manifest disagree, so the map cannot drift.
3. **Render and audit.** `scripts/render.mjs` opens the spec in the playground at 380 and 1024 px, light and dark, saves four screenshots and counts faults: error boxes, console errors, sideways overflow, clipped text and input values, empty boxes, leaked `NaN` or raw JSON, and axe violations when axe-core is installed.
4. **Look.** The agent reads its own screenshots through one review lens at a time (archetype, the answer, data truth, dates, numbers, layout at 380, hierarchy, density, states, both themes, interaction).
5. **Fix and repeat.** It fixes the cause and renders again, up to four rounds, and stops after a clean one.

Two rules outrank the rest. The agent never changes your numbers, dates or names to make a widget look right; if a widget misbehaves with true data, it keeps the data, tries another widget, and lists the fault under **Widget faults** in its answer. And invented sample data never has a date after today.

By default the script renders through the public playground. To test against your own build, serve the site (`bun run build:site`, then `bunx vite preview --port 4790` in `packages/svelte`) and pass `--base http://localhost:4790` or set `RIPPLE_BASE`.

## Does it help

On six small cards scored by a judge model out of 20, a one-shot spec scored 12.1, the skill's rules without the loop 13.8, and the full loop 15.7, with clean audits on 5 of 6 against 2 of 6. That is n=6 with one run per arm and one judge, so read it as a direction, not a settled margin. The loop costs two to three minutes a card and pays off most where a layout can break at phone width.

The method comes from [Anatomy](https://github.com/wheresryan22/anatomy), a skill that does the same render, audit and look loop for isometric drawings.
