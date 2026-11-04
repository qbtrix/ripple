# Chat recordings for every gallery example, 2026-11-04

The landing chat (`pawbar/recorded.ts` `answerPool`) now replays a real model
recording for every `/live` gallery example: every gallery run, plus chat-only
recordings of the widget demos and the playground's example spec
(`live/scenarios.ts` `chatRecordings`). Nothing in the pool is hand-written;
`play-cards.test.ts` fails if one comes back.

All 36 were recorded with `record-scenario.ts` on Sonnet, one take each, except
the three marked below. Before this, the recorder offered only the primitive
categories and the data widgets, so `figure`, `iso-scene`, the app cards and
the research pieces were invisible to the model. `scripts/recorder-widgets.ts`
now offers every widget the gallery uses (its test holds it to that), and
CARD SHAPE routes those topics to their widgets.

Bytes are the recorded JSON. "Replaces" names what the chat used to replay.

| Id | Top widget | Bytes | Model |
|---|---|---|---|
| heart-pump | figure | 1267 | sonnet |
| bike-gears | figure | 976 | sonnet |
| rocket-engine | figure | 1631 | sonnet |
| ion-thruster | figure | 1305 | sonnet |
| tokamak | figure | 1277 | sonnet |
| fission-reactor | figure | 1301 | sonnet |
| particle-collider | figure | 1490 | sonnet |
| heart | figure | 1636 | sonnet |
| iso-bike | figure | 855 | sonnet |
| iso-heart | figure | 1006 | sonnet |
| iso-engine | iso-scene | 2599 | sonnet |
| memory-match | memory-match | 482 | sonnet |
| word-guess | word-guess | 266 | sonnet |
| space-trivia | quiz | 1771 | sonnet |
| tic-tac-toe | board-game | 191 | sonnet |
| connect-four | board-game | 218 | sonnet |
| habit-tracker | habit-tracker | 438 | sonnet |
| focus-timer | focus-timer | 302 | sonnet |
| lisbon-walk | flex | 1824 | sonnet |
| coffee-nearby | place-results | 1797 | sonnet |
| desk-deals | product-grid | 2367 | sonnet |
| idea-notes | notes | 864 | sonnet |
| my-week | week-schedule | 1468 | sonnet |
| team-sync | agenda | 760 | sonnet |
| lisbon-weather | weather-forecast | 755 | sonnet |
| focus-music | music-player | 814 | sonnet |
| ocean-docs | media-grid | 1420 | sonnet |
| appointment | booking | 2915 | sonnet |
| cafe-menu | menu-order | 2040 | sonnet |
| compare-tech | comparison-layout | 1452 | sonnet |
| find-recipe | recipe | 1831 | sonnet |
| track-order | order-status | 1029 | sonnet |
| mission-control | flex | 2977 | sonnet |
| company-snapshot | card | 1261 | sonnet |
| newsletter-signup | card | 2505 | sonnet |
| hello-card | card | 1171 | sonnet |

## What each group replaced

- **Figures** (heart-pump, bike-gears, rocket-engine, ion-thruster, tokamak,
  fission-reactor, particle-collider): hand-written `figure` cards. The model
  picks the same catalog id, its own starting params and its own labels.
- **Play and habit cards** (memory-match, word-guess, space-trivia,
  tic-tac-toe, connect-four, habit-tracker, focus-timer): hand-written cards in
  `play-cards.ts`. The recordings drop the hand-written "harder round" ask
  button, and the habit tracker starts with an empty week instead of seeded
  ticks.
- **Iso drawings** (iso-bike, iso-heart): the model answers with the bike-gears
  and heart figures rather than an `iso-scene`; iso-engine stays an `iso-scene`.
- **heart** (the old drawing chip): the model draws the heart figure, not an
  `illustration`.
- **App cards** (lisbon-walk, coffee-nearby, desk-deals, idea-notes, my-week,
  team-sync, lisbon-weather, focus-music, ocean-docs): hand-written cards in
  `app-runs.ts`. The chips that asked for these topics (directions, coffee
  shops, browse products, notes, weekly schedule, meeting agenda, weather,
  music, documentaries) now point at these ids.
- **Widget demos, chat only** (appointment for booking, cafe-menu for
  menu-order, compare-tech for comparison-layout, find-recipe for recipe,
  track-order for order-status, mission-control, company-snapshot for the
  Pocket boards demo, newsletter-signup for the form flow demo) and
  **hello-card** for the playground example. The gallery keeps showing the
  demos themselves.

## Retakes and gaps

- hello-card took four takes. The first three showed 2.3% churn as 230%
  (`format: "percent"` takes a fraction); the recorder now says so, and the
  fourth writes 0.023.
- lisbon-walk and company-snapshot each took a second take. The first used
  `carto-voyager` map tiles and `company-header`, which the chat's card policy
  refuses; the recorder now tells the model both rules.
- choice-cards has no recording. It is a flow step that only a live, multi-step
  host flow runs (the laptop and trip chips); its take came back as a
  comparison card, so it was dropped (`LIVE_ONLY_DEMOS`).
- No take needed Opus.
