# Craft rules for Ripple cards

Every rule names the card that taught it. F-numbers are faults from two audits of 60 generated cards each
(October 2026); "G:" marks a fault found by rendering the gallery recordings with `scripts/render.mjs`; "A/B:" marks
one found while testing this skill on six small cards. "Enforcer" is what catches it mechanically; "eyes" means
only a look at the screenshot does.

Each rule carries its id as `rule:<id>`. The same ids live in Ripple's manifest (`craft.rules`, with the lens a
critic uses and the check that enforces the rule), so a prompt, an audit fault and a critic issue all name the rule
they mean. A test in the ripple repo (`packages/svelte/src/lib/manifest/skill-widgets.test.ts`) fails when an id here
is missing from the manifest or a manifest id is missing here.

## Contents
0. The data is the user's
1. Choose before you build
2. Layout and width
3. Hierarchy
4. Density and fill
5. Numbers, money and units
6. Empty, loading, error and edge states
7. Tone and colour tokens
8. Interaction and state
9. Words and data truth
10. Spec hygiene

## 0. The data is the user's

- **Never change the data to make a widget look right.** `rule:data-fixed` A number, a date, a name, an amount or a target the user
  gave you is fixed. A/B: weather removed its hourly rain chances and set today to 5% so the widget's "Dry." line
  stopped contradicting the card; A/B: habits cut its targets from 7 to 5 and 4 so the verdict read "2 of 3 on
  track". Both made the audit and the screenshot look better and the card false. When a widget misbehaves with true
  data, keep the data, try another widget or layout, and if nothing works ship the honest card and list the fault
  under **Widget faults** in the final answer. Enforcer: eyes (the data-truth lens) and the final answer's section.
- **Invented dates are never after today.** `rule:no-future-dates` A/B: a running log for "this month" held runs dated after today; every
  number agreed with every other number, so the consistency check passed and the judge still caught it.
  Internal consistency is not plausibility. Look up today's date before writing any. A forecast is the one place
  future days belong, and it says it is a sample. Enforcer: `futureDate` (dates after today, skipped under
  `meta.sample: true`), with eyes (the dates lens) as the backup.
- **Invented is fine, false is not.** `rule:invented-not-false` Fictional names and sample numbers are expected when the user gave none; say
  which values are samples in the answer so they can be swapped.

## 1. Choose before you build

- **Name the card's one question, then its archetype, then its widget.** `rule:archetype-first` "Is 3pm free?" is a day of slots with one lit,
  not a form. Notepad came back as a form (F5); "play music" came back as buttons with no player (F6); deals, places
  and podcasts as bare sortable tables (F15); due diligence, agenda and invoice as forms (F16). All were fixed by a
  data widget (`notes`, `music-player`, `product-grid`, `place-results`, `media-grid`, `checklist-layout`, `agenda`,
  `invoice-layout`). Enforcer: eyes plus `references/widgets.md`.
- **A data widget stands alone.** `rule:data-widget-alone` "Watch savings grow" wrapped `growth-projection` in hand-built sliders and a
  stepper: the controls appeared twice and a slider thumb covered the balance label (F13). The widget already has
  "Try other numbers". Enforcer: `twoControls` (two controls bound to one state value).
- **A booking is a `booking`.** `rule:booking-widget` The gallery's haircut card (G: `book-appointment`) builds services, slots, name and
  phone from buttons and inputs; it works, but a `booking` gives stages, a review step and the host's real slots,
  and a dentist once got a restaurant table form because the hand-built path guessed (F14).
- **Primitive trees are the fallback, not the default.** `rule:primitives-fallback` Hand-assembled cards are where quality is model-bound: no
  widget owns their layout. Use them for small tools (a converter, a quote) and keep them to about 25 to 90 nodes.

## 2. Layout and width

- **The card must read at 360 px and at 720 px.** `rule:reads-at-phone` The render script shoots 380 and 1024 viewports, which give a card
  surface of about 322 and 623 px. Long turn-by-turn text ran off the table edge (F4); NDA table cells were cut
  mid-word (F12). Enforcer: `render.mjs` `overflow` and `clippedText`.
- **Tile rows wrap.** `rule:tile-rows-wrap` For a row of tiles use `"columns": "repeat(auto-fit, minmax(150px, 1fr))"` (260px for cards side
  by side); otherwise at most 2 fixed columns. A 4-column grid of stats is 80 px a tile on a phone. Set `wrap: true` on
  a flex row with more than two children.
- **Truncation is a fault, not a style.** `rule:no-truncation` `overflow: hidden` and an ellipsis do not excuse lost words. G:
  `tokyo-trip` cuts "Arrive and settle in Asakusa" at 380; G: `refund-approval` cuts a tool argument to "late_del…" (both since fixed in
  the widgets: the rule still holds for your own text).
  Shorten the text at the source (a day title of 3 to 4 words) or give it a row of its own. Enforcer: `clippedText`.
- **Nothing pokes past the card.** `rule:nothing-past-card` G: `plane-3d`'s label pill for the right-most point sits 1 px past the card edge at
  380 (since fixed: pins flip left at the right edge). Enforcer: `overflow` (a sideways scroller inside the card is listed too; accept it only when the widget
  designed it, like `exec-dashboard`'s filter-chip row or `comparison-layout`'s table with 4 or more items).
- **A designed sideways scroll is the widget's, not yours, and the audit still counts it.** `rule:designed-scroll` Accept one only when
  the widget owns that scroller (its class is the widget's, not a box you added), the content in it is a strip
  the reader expects to swipe (chips, a wide table), and nothing outside it scrolls. Then the round can end with
  `overflow` above 0: list each accepted scroller by its locator in your answer. A scroller you built, or a whole
  card that scrolls, is never accepted.
  The reviewed waivers the build loop already discounts are `waiver:weather-forecast/overflow` (the hourly strip)
  and `waiver:data-grid/overflow` (a wide table); the manifest's `waivers` lists them with their reasons.
- **Inputs get a full row or a 2-column grid.** `rule:inputs-full-row` A number input beside a long label squeezes both; a slider thumb must
  never sit on a label (F13).

## 3. Hierarchy

- **The answer leads.** `rule:answer-leads` The data widgets listed in `widgets.md` as taking `verdict` show the one-sentence answer first (others drop it silently); primitive cards put it in the card
  `title`/`description` or a first `callout`. A reader should get the point in one second. G: `incident-rollback`
  states the likely cause in bold after the chart, which is right for a diagnosis but means the first screen is three
  tool-call rows.
- **One primary action per card.** `rule:one-primary-action` One default-variant button; the rest `outline` or `ghost`. Deny next to Approve
  is a pair, which `approval-gate` already styles.
- **One heading per section, most important section first.** `rule:one-heading-per-section` Each section in a titled card. Labels are small and
  muted, values large; a label never outweighs its value (G: `quote-builder` item titles are larger than the line
  totals they explain).
- **Colour encodes data or state only.** `rule:colour-is-data` No decorative tints. A brown "coffee" tint on a panel (F18) was a token fault.

## 4. Density and fill

- **Every element is bound to a data field or an action.** `rule:every-element-bound` Sparse cards are fixed with real fields (unit, source,
  timestamp, delta), never with gradients, icons or filler copy. The two failure modes: "abstract" (icon, title,
  three chips, "Metric 1/2/3") and "flat" (one white card, a paragraph, a button).
- **No dead region.** `rule:no-dead-region` No empty lower half, no chart plot under about a third of its card, no empty photo box (F18).
  Enforcer: `emptyContainers` (in-flow boxes 40 px or more with nothing in them).
- **Dashboards are more than a stat row.** `rule:dashboards-not-stat-rows` Plain stat rows with the same number twice (F17) is the generic look;
  `exec-dashboard` from raw rows gives KPIs with deltas, a chart, a breakdown and a table that agree.
- **On a phone, tiles pair up.** `rule:phone-tiles-pair` G: `sales-dashboard` at 380 stacked its 4 KPI tiles one per row (fixed since: two a row), 4 screens of
  scrolling before the chart. A widget fix, but the rule holds for primitive cards: 2 tiles a row at 360.

## 5. Numbers, money and units

- **Every computed or decimal number goes in a `stat` with `format: number|currency|percent`** (and `decimals` when
  the size rule is wrong). `rule:numbers-in-stat` "8,971.429 steps" (F10) came from a sum/length in a text template. `stat` now rounds by
  size (whole from 100, one decimal from 10, two below). Enforcer: fixture in ripple (8dcabf5, #229); live: eyes.
- **Money carries its currency everywhere.** `rule:money-has-currency` `currency` is an ISO code, never a symbol inside a number. G:
  `quote-builder` titles say "(650 per page)" while totals say "$3,250.00"; G: `refund-approval` says "shipping 14
  plus 15% of 240". Put money in a stat, or write the amount formatted in the state value itself.
- **Missing numbers show a dash, never NaN.** `rule:missing-shows-dash` The invoice tax row read "USDNaN" because the model wrote
  `summary[].amount` where the widget reads `value` (F11). Use the exact prop names in `widgets.md`. Enforcer:
  `badText` (NaN, undefined, null, Infinity, `[object Object]`, `{state.` left unevaluated).
- **One number, one value.** `rule:one-number-one-value` G: `sales-dashboard` shows revenue "$1,499" in the KPI and "$1,498.78" as the table total.
  Rounding a headline is fine; say "about" or keep the cents in both.
- **Size for the worst case.** `rule:size-worst-case` Check the longest name, the biggest number and the 1-based counter at its end; a
  counter never passes its total.

## 6. Empty, loading, error and edge states

- **A data widget with 0 rows passes the checks and shows a blank card.** `rule:empty-rows` Seed real rows or say why there are none.
- **A widget that throws shows "This widget hit an error" inside the card** (F7, pizza). `rule:widget-error` Usually a bad prop shape.
  Enforcer: `errorBoxes` (`[data-ripple-node-error]`), the playground strip's `specStatus` ("Valid, N nodes" or the
  `specIssues` problems).
- **An unknown widget type renders a red box naming it.** `rule:unknown-widget` Enforcer: `errorBoxes` (`[data-ripple-unknown-widget]`).
- **Raw JSON must never reach the reader**, neither as chat text (F1) nor inside cells (F2, comparison cells printed
  objects). `rule:no-raw-json` Text props take strings; `text-coerce` stringifies objects on purpose, so the fault shows as JSON-looking
  text. Enforcer: `badText` "raw JSON".
- **Show each choice once.** `rule:choice-once` Flow choice cards rendered twice (F19, a renderer bug); the same label twice is still
  worth a look in the screenshot.

## 7. Tone and colour tokens

- **Use the theme, not hex.** `rule:theme-not-hex` Widgets follow the shadcn tokens and `--ripple-*`; the spec's `theme` block exists for
  a brand colour, not for decoration. Status colour goes through `badge`/`callout`/`alert` variants
  (success, warning, destructive, info) so it works in both themes.
- **Check both themes.** `rule:both-themes` A white 3D model on a light card all but vanishes (G: `plane-3d` light; the stage now has a toned backdrop, but other drawings do not). The audit cannot see
  contrast inside a drawing or a canvas; the screenshot can. Enforcer: eyes, axe-core when installed.
- **Charts draw on canvas.** `rule:charts-on-canvas` The audit cannot read their labels: G: `incident-rollback`'s last x-axis tick is cut to
  "14:2" at 1024 and nothing counts it. Look at every chart in the PNG.

## 8. Interaction and state

- **Bind inputs, derive outputs.** `rule:bind-derive` Inputs bind to state (`"bind": "{state.path}"`); every output is an expression of
  state. Never hard-code a copy of a state value (`state.items.length`, not 4).
- **Lists keep their numbers fresh.** `rule:lists-fresh` When a number depends on a list, keep it in state and refresh it with a `set`
  after every push or remove and in the `on_change` of any input that edits a row. Seed it with exactly what its
  expression gives.
- **Only real actions.** `rule:real-actions` set, toggle, push, remove, open, toast, validate, flow, branch, emit. There is no api,
  navigate, confirm or delay; one drops the card.
- **Validate before side effects.** `rule:validate-first` G: `quote-builder` runs `validate` (at least one line) before it emits
  `send_quote` and toasts. Every send, book or approve should.
- **Expressions are small.** `rule:small-expressions` Paths, + - * / %, comparisons, `||`, `??`, a ternary only as the whole expression. No
  `**`, no Math. Division by zero gives 0. A sum repeated by hand across four stats (G: `quote-builder`) breaks the
  day a fifth line is added: keep it in state once.

## 9. Words and data truth

- **Fictional names and sample data.** `rule:fictional-names` Never attach a price, rating or opening hours to a real named business or
  brand; placeholders are generic words, never lorem ipsum. "Person 1 ... Person 4" (G: `bill-splitter`) is
  placeholder data a reader notices: use names.
- **Labels are words, not identifiers.** `rule:labels-are-words` "late_delivery" and "refund_policy" are fine inside a `tool-call` (they are
  the tool's real arguments) but not in a status, label or option.
- **The data agrees with itself.** `rule:data-agrees` G: `return-exchange` says "Pick a bigger size" and offers "8.5 (sold out)" under
  "Only sizes in stock are shown". A machine cannot catch this; read the card's words once as the visitor.
- **Weather and other made-up live data say so** `rule:sample-says-so` (`note: "Sample forecast"`).
- **Words never get bent to fit either.** `rule:words-not-bent` If a widget's own wording ("Dry.", "On track") contradicts true data, that
  is a widget fault for the final answer's list, not a reason to change the data (section 0).

## 10. Spec hygiene

- **Keys in order: type, props, then bind and handlers, then children.** `rule:keys-in-order` Streams paint sooner.
- **Leave out defaults; repeat with `each` over state.** `rule:leave-out-defaults` Smaller specs stream faster and break less: long
  illustration JSON hit unterminated strings and a restart (F8, F9; 37 to 60 s to a card).
- **Same-site links only** `rule:same-site-links`; no full URLs, expressions or CSS `url()` in images and links.
- **Bulk data comes from the host** `rule:bulk-data-from-host`, not typed into the spec (more than a few dozen records).
