# standup-board visual review

Worst-case specs for the `standup-board` widget and the command that renders
them into one contact sheet per review round.

## Specs (`specs/`)

| Spec | What it stresses |
|---|---|
| `normal-5.json` | 5 people, 2 blocked, 1 away: the everyday card |
| `all-clear.json` | 7 people, no blockers, one done, one away |
| `many-blocked.json` | 5 of 8 blocked: proportion verdict, folded Today on phone |
| `long-text.json` | very long title, names, roles and a 400+ char blocker |
| `two-people.json` | 2 people: no filter, nobody collapses |
| `ten-people.json` | 10 people: collapsed rows, done and away groups |
| `sparse.json` | names only, `status: blocked` with no text, junk blocker, `pto` |

## Run a round

From the ripple worktree root:

```bash
packages/svelte/review/standup-board/review.sh <N>             # build the site, render, sheet
packages/svelte/review/standup-board/review.sh <N> --no-build  # reuse the last build
```

It builds the site (`bun run build:site`, through `scripts/gate --scope ripple`
when the gate is there), refreshes the copied `@ripple-ui/core` in
`packages/svelte/node_modules`, serves `build/` with
`vite preview --port 4820 --strictPort` in the background, renders every spec
with `skills/ripple/scripts/render.mjs` at 380 and 1024 in light and dark,
stops the server, and writes:

- `round-<N>/<spec>/{380,1024}-{light,dark}.png` and `audit.json`
- `round-<N>/sheet.png`: every spec at 380 light, 380 dark and 1024 light, labelled

It prints each spec's audit counts. `render.mjs` exits 1 on any fault; the
round keeps going and the counts stay in each `audit.json`.

Needs ImageMagick (`magick`) and Playwright's headless Chromium in
`~/Library/Caches/ms-playwright/chromium_headless_shell-1228`.

## Known audit counts

`clippedText` counts on specs with 5 or more people are the one-line rows
the brief asks for: each collapsed on-track, done or away row cuts its name,
Today and Yesterday to one line with an ellipsis (`truncate`), and a tap
expands it. `craft.ts` carries a reviewed waiver for exactly that
(`standup-board` / `clippedText`); `render.mjs` prints raw counts, the build
loop applies the waiver. Any clipped item that is not a `truncate` cell on a
collapsed row is a real fault.
