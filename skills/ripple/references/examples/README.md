# Examples

Four specs from Ripple's gallery recordings (`packages/svelte/src/routes/live/fixtures/` in the ripple repo, joined
from their stream chunks) and one comparison written for this skill. Each one rendered at 380 and 1024, light and
dark, on 2026-10-13: four with every count at 0, and
`sales-dashboard` with one listed item, the widget's own filter-chip row that scrolls sideways at 380
(designed, accepted). Render one before you write a card like it, from your project: `node <skill>/scripts/render.mjs <skill>/references/examples/bill-splitter.json <outdir>`.

| File | Archetype | Why it is good |
|---|---|---|
| `bill-splitter.json` | one data widget | Nine props and no layout at all: `bill-split` does the cents-exact maths, the cards and the totals, so the answer ("Everyone pays $54.98") leads and nothing can be mis-summed. |
| `sales-dashboard.json` | report from raw rows | It hands `exec-dashboard` the 15 raw orders plus measures and dimensions, and the widget derives KPIs, deltas, the stacked chart, the region bars and a table whose total matches the rows. One truth model, no number typed twice. Watch: the KPI rounds revenue to "$1,499" while the table total keeps "$1,498.78" (craft.md section 5). |
| `heart-pump.json` | explainer | A `figure` from the catalog with labels on known anchors and a one-line caption that says what to move and what to watch. The model writes 1 KB; code owns the drawing. |
| `grinder-comparison.json` | choose between options | One `comparison-layout` holding only data: the verdict leads, the winner card says why in numbers the rows show, `picks` tag the other two by need, `better` marks the best cells, and the table under the cards fits a phone without scrolling. |
| `quote-builder.json` | small tool from primitives | The best primitive card in the gallery: every number is a `stat` with `format: "currency"` derived from state, inputs are bound, the Send button validates before it emits. Watch: item titles print raw prices ("650 per page", no currency), and the totals repeat a long hand-indexed sum; a fifth line would need every expression edited. |

What none of them do: hand-build something a data widget already does, type a number that state could compute,
or put a brand, a real venue or "Person 1" where a fictional name belongs (bill-splitter's people are the one
exception, and it shows: give them names).
