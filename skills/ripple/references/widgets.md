# Widgets: intent to the best widget

Built from Ripple's manifest. `*` marks a required prop. A test in the ripple repo
(`packages/svelte/src/lib/manifest/skill-widgets.test.ts`) fails when a widget or a prop named in these tables
leaves the manifest, so the tables match the code they shipped with. The full prop list for any widget lives in the
served manifest, `<base>/manifest.json` (the same base `render.mjs` uses):

```sh
curl -s https://ripple-site.pawsites.workers.dev/manifest.json | jq '.widgets[] | select(.type=="booking")'
```

**Rule zero: when a data widget fits, the card is that one widget holding only data.** Do not wrap it in a card,
do not add your own inputs beside it (it has them), do not rebuild it from primitives. With money, pass `currency`
as an ISO code (`"USD"`, never `"$"`).

Not every data widget takes a headline. Most take `title`; only some take `subtitle` and a one-sentence answer
`verdict: {text, status: good|warn|bad|info|neutral}` (at most 140 chars, shown first):

`verdict` works on: `booking`, `comparison-layout`, `exec-dashboard`, `flashcard-deck`, `growth-projection`, `interval-workout`, `itinerary`, `meal-plan`, `menu-order`, `recipe`.

On any other widget a `verdict` is dropped without a word. Put the answer where that widget has room for it (a
`title`, a `note`) or leave it to the data.

## Data widgets (the model fills data, the widget designs)

| The ask | Widget | Key props |
|---|---|---|
| Split a bill or a tip | `bill-split` | `subtotal*`, `people*[{id,name,extras}]`, `tip_percent`, `tip_options`, `tax`, `extras_label`, `note`. Never seed its bind key in state. |
| Sales, finance or any report over rows | `exec-dashboard` | `rows` (raw records), `measures[{key,label,format,agg,good}]` (format money, number or percent; agg sum, count or avg), `dimensions[{key,label}]`, `x`, `split`, `verdict` |
| Savings, compound growth, "what if I save X" | `growth-projection` | `deposit*`, `rate*` (% a year), `years*`, `initial`, `goal`, `verdict` |
| Choose between options | `comparison-layout` | `items*[{id,name,price}]`, `features[{key,label,kind,better,unit}]`, `winner{id,reason}`, `verdict` |
| Plans and prices, subscription tiers | `pricing-table` | `tiers*[{id,name,price,period,description,features,cta,popular,actions}]`, `currency`, `on_select`. Write period as "month", not "/month". A CTA fires the tier's own actions, else the node's on_select with id and name. No title or verdict: put the headline in a heading above it only if the card needs one. |
| Things to buy, deals | `product-grid` | `products*[{name,brand,category,price,was,rating,badge,color,specs}]`. Covers are generated: leave the image field out. |
| Places to go (cafes, restaurants, parks) | `place-results` | `places*[{name,kind,rating,price,distance,open,hours,tags,lat,lng}]`; lat and lng add the pin map |
| Films, shows, podcasts, books | `media-grid` | `kind`, `items*[{title,by,year,minutes,genres,rating,color}]` |
| Order food from a menu | `menu-order` | `items*[{product_id,name,price}]`, `featured{id,reason}`, `verdict`; the host fills the rest |
| Book an appointment or a table | `booking` | `services[{id,name,duration_min,price}]`, `days[{date,date_label,slots}]`, `party`, `preferred{date,after}`, `verdict`. For a table leave services and days to the host. |
| A trip | `itinerary` | `days*[{label,when,theme,stops}]` with stops of `{time,title,kind,place,cost,minutes}`, `budget`, `packing[{group,items}]` (chips, not tickable), `verdict`. Bind days so ticks persist. |
| A week of meals | `meal-plan` | `recipes*[{id,name,serves,kcal,protein_g,ingredients}]` once, `days*[{day,meals}]` with meals of slot and recipe id, `people*`, `verdict` |
| One dish | `recipe` | `name*`, `serves*`, `ingredients*[{name,qty,unit}]`, `steps[{text,minutes}]`, `kcal`, `protein_g`, `verdict` |
| A workout | `interval-workout` | `exercises*[{name,cue}]`, `workSec*`, `restSec*`, `rounds`, `verdict` |
| Study cards | `flashcard-deck` | `cards*[{front,back,hint}]`, `verdict` |
| A quiz or trivia | `quiz` | `questions*[{prompt,choices,answer,why}]` (answer is the index of the right choice) |
| Notes, jotting down | `notes` | `notes[{title,text,tags,pinned}]`, `tags`. Never inputs and buttons. |
| Music, focus sounds | `music-player` | `tracks*[{title,sound,minutes}]` (sound is rain, lofi, ocean, forest, piano, brown-noise, white-noise or drone) |
| Weather | `weather-forecast` | `place*`, `unit`, `now{temp,condition,feelsLike,humidity,wind}`, `days*[{day,condition,high,low,rainChance}]`, `hourly[{time,temp,condition,rainChance}]`, `note` ("Sample forecast" when made up). Takes no title, subtitle or verdict: the place is its heading. |
| A week of classes or shifts | `week-schedule` | `events*[{day,start,end,title,place,color}]` (start and end as "HH:MM") |
| A meeting plan | `agenda` | `title*`, `start`, `items*[{title,owner,minutes}]` |
| Tasks, audits, onboarding, a to-do or packing list | `checklist-layout` | `items*[{id,label,description,state,owner,due}]` (state pending, in-progress, done, blocked or skipped; owner is `{name}`), `groupBy` (none, state or owner only), `bind` the items so ticks persist. Grouped by topic (clothing, food): one checklist-layout per group with the group as its `title`, never the topic in owner. |
| Habits | `habit-tracker` | `habits*[{id,name,icon,target_per_week}]` (target 1 to 7) |
| Pomodoro or focus timer | `focus-timer` | `focus_min`, `short_break_min`, `goal_rounds`, `task` |
| An invoice, quote document, receipt | `invoice-layout` | `from*`, `billTo*`, `invoiceNumber*`, `issueDate*`, `lines*`, `summary[{label,value}]` (the field is value, not amount) |
| One record (a person, account, project) | `entity-detail` | `title*`, `status{label,variant}`, `kpis[{label,value,delta}]`, `meta[{label,value}]`, children for the body |
| A long form or survey | `form-layout` | `sections[{id,title}]`, `submitLabel`, with a form node inside |
| How a machine or organ works | `figure` | `figure*` (catalog id: heart, bike-gears, rocket-engine, ion-thruster, tokamak, fission-reactor, particle-collider), `labels[{anchor,note}]`, `caption` |
| A 3D object to orbit | `model-viewer` | `asset` (built-in id: plane, heart, skeleton, ...), `annotations[{anchor,label}]` |
| Directions, a route, locations | `map` | `center`, `zoom`, `markers[{id,lat,lng,label}]`, `route` (a list of lat, lng pairs), `height` ("320px") |
| An agent asking to act | `approval-gate` | `title`, `summary`, `risk`, `diff`, `toolCalls` |
| What an agent checked | `tool-call` | `name`, `status`, `args`, `result` |
| Games | `memory-match`, `word-guess`, `board-game` | see the manifest |

## Building blocks (only when no data widget fits)

| Need | Widget | Key props and the trap |
|---|---|---|
| A titled section | `card` | `title`, `description`, `variant`. Root of a primitive card; children go in the body. |
| Tiles in a row | `grid` | `columns: "repeat(auto-fit, minmax(150px, 1fr))"` so it wraps (260px for cards side by side). Otherwise at most 2 fixed columns. |
| Stack or row | `flex` | `direction`, `gap`, `align`, `justify`, `wrap: true` on a row with more than two children |
| Repeat rows | `each` | node-level `items: "{state.list}"`; inside, `{item}` and `{index}`; bind a row field with a path like list.{index}.field |
| Show or hide | `if` | node-level `condition` |
| A number | `stat` | `value*`, `label`, `format: number\|currency\|percent\|compact`, `decimals`, `currency`. Every derived or decimal number goes here, never in a text template. |
| A headline number with trend | `stat` | `delta` plus `direction: "up-good"` |
| Prose, labels | `text` | `text`, `size`, `weight` |
| A section heading | `heading` | `text*`, `level`. One heading per section. |
| The one takeaway | `callout` | `text*`, `title`, `variant: info\|success\|warning\|insight` |
| A warning or error | `alert` | `variant: warning\|destructive`, `title`, `description` |
| Status | `badge` | `text`, `variant: success\|warning\|destructive\|secondary\|outline` |
| Plain facts | `kv-table` | `rows*[{key,value}]`, `columns: 1\|2` |
| Rows of records | `table` | `rows*`, `columns*[{header,accessorKey,align}]`. Cells hold short phrases; long text wraps but reads badly. |
| A trend or split | `chart` | `type: bar\|line\|area\|donut`, `data*[{label,value}]`, `height`. Drawn on canvas: the audit cannot read its labels, look at the PNG. |
| Dated events | `timeline` | `events*[{date,title,detail}]` |
| Progress toward a total | `progress` | `value`, `max` (a 1-based counter never passes its total) |
| Number entry | `number-input` | `label`, `min`, `max`, `step`, `bind` |
| A range | `slider` | `label`, `min`, `max`, `step`, `showValue`, `bind` |
| One of 2 to 5 | `segmented` | `options*`, `bind`. More than 5, or long labels: a select or a radio group. |
| On or off | `switch` | `label`, `bind` |
| An action | `button` | `label`, `variant`, `on_click`. One primary (default variant) per card. |

## Never

- An unknown type (`price-card`, `navbar2`): it renders a red "isn't in the catalog" box.
- `root`, `tree`, `view`, `body` or `content` instead of `ui`: nothing renders.
- An image or link to a full URL, an expression or a CSS `url()`: the policy drops the card.
- `on_checkout` or `on_book` written by the model, or a `type` field on a data row that names a widget (call it `kind`).
- A prop the widget does not list. It is dropped without a word (a `verdict` on `weather-forecast` never shows).
