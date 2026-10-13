---
title: Data widgets
description: The app-like widgets a model fills with data (notes, music, weather, schedules, places, products, posters, maps) and what changed in the older ones.
order: 9
---

These widgets each stand for a small app. The model writes the data, the widget does the layout, the controls and the motion. Every example below is live: it is the same JSON a model would stream.

Each section names the props a model fills. The full prop list for any widget is on its page under [Widgets](/docs/widgets).

## notes

A notepad. The visitor writes straight in, `#tags` become filter chips, notes can be pinned, edited and deleted with undo. Seed it with `notes`, or leave them out for a blank pad. Bind it to keep what the visitor writes.

Props a model fills: `title`, `notes` (`title`, `text`, `tags`, `pinned`, `color`), `tags`, `placeholder`.

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "notes",
    "bind": "{state.notes}",
    "props": {
      "title": "Ideas",
      "tags": ["idea", "todo"],
      "notes": [
        { "id": "n1", "title": "Market stall", "text": "Try a small batch of lemon cookies first.", "tags": ["idea"], "pinned": true, "color": "yellow" },
        { "id": "n2", "title": "Call the printer", "text": "Ask about the price of 200 flyers.", "tags": ["todo"] }
      ]
    }
  }
}
```

## music-player

A player whose sounds are made in the browser. There are no files or URLs, so a model cannot point it at anything. Each track picks a `sound` preset: `rain`, `brown-noise`, `white-noise`, `ocean`, `forest`, `lofi`, `drone` or `piano`. Sound starts only when the visitor presses Play.

Props a model fills: `title`, `tracks` (`title`, `artist`, `sound`, `minutes`, `color`), `volume`.

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "music-player",
    "bind": "{state.music}",
    "props": {
      "title": "Focus mix",
      "tracks": [
        { "title": "Soft rain", "sound": "rain", "minutes": 10 },
        { "title": "Late night keys", "sound": "lofi", "minutes": 4, "color": "violet" },
        { "title": "Still water", "sound": "ocean", "minutes": 8 }
      ]
    }
  }
}
```

## weather-forecast

A weather card with animated icons, a range bar per day and a C/F toggle. Conditions are a fixed set of words (`sunny`, `partly-cloudy`, `cloudy`, `rain`, `heavy-rain`, `thunder`, `snow`, `fog`, `wind`, `night-clear`); other words map to the closest icon. Ask the model to write `note: "Sample forecast"` when it made the numbers up.

Props a model fills: `place`, `unit`, `now`, `days` (`day`, `condition`, `high`, `low`, `rainChance`), `hourly`, `note`.

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "weather-forecast",
    "props": {
      "place": "Lisbon",
      "note": "Sample forecast",
      "now": { "temp": 21, "condition": "partly-cloudy", "humidity": 64, "wind": "14 km/h NW" },
      "days": [
        { "day": "Mon", "condition": "partly-cloudy", "high": 23, "low": 16, "rainChance": 10 },
        { "day": "Tue", "condition": "sunny", "high": 25, "low": 17 },
        { "day": "Wed", "condition": "rain", "high": 18, "low": 14, "rainChance": 80 }
      ]
    }
  }
}
```

## week-schedule

A week calendar. Events are blocks on a days by hours grid; overlapping events sit side by side and open their details on press. Use one colour per kind of event, or leave `color` out and the widget colours by title.

Props a model fills: `title`, `startHour`, `endHour`, `days`, `events` (`day`, `start`, `end`, `title`, `place`, `color`).

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "week-schedule",
    "bind": "{state.selected}",
    "props": {
      "title": "My week",
      "startHour": 8,
      "endHour": 20,
      "events": [
        { "day": "Mon", "start": "09:00", "end": "12:00", "title": "Deep work", "color": "blue" },
        { "day": "Wed", "start": "18:00", "end": "19:00", "title": "Gym", "place": "Studio 4", "color": "green" },
        { "day": "Thu", "start": "10:00", "end": "11:00", "title": "Design review", "color": "purple" }
      ]
    }
  }
}
```

## agenda

A meeting agenda. It works out each item's start time from `start`, shows how the time splits, lets the visitor tick items off and reorder them, and has a run mode with a countdown.

Props a model fills: `title`, `start`, `items` (`title`, `owner`, `minutes`, `notes`).

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "agenda",
    "bind": "{state.agenda}",
    "props": {
      "title": "Weekly team sync",
      "start": "10:00",
      "items": [
        { "title": "Wins from last week", "owner": "Maya Chen", "minutes": 5 },
        { "title": "Metrics review", "owner": "Leo Park", "minutes": 10, "notes": "Signups and support load" },
        { "title": "Actions and owners", "minutes": 5 }
      ]
    }
  }
}
```

## place-results

Search results for places: cards with rating, price, distance and opening state, plus sort and filter. Give `lat` and `lng` and a numbered pin map appears above the cards. There are no images or links, so nothing the model writes can lead off the page. `on_choose` fires on "Tell me more".

Props a model fills: `title`, `query`, `places` (`name`, `kind`, `rating`, `price`, `distance`, `open`, `hours`, `tags`, `blurb`, `lat`, `lng`).

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "place-results",
    "props": {
      "title": "Coffee near Harbor Square",
      "query": "quiet cafes with wifi",
      "places": [
        { "id": "p1", "name": "Blue Door Coffee", "kind": "cafe", "rating": 4.7, "reviews": 812, "price": 2, "distance": "350 m", "open": true, "tags": ["wifi", "quiet"] },
        { "id": "p2", "name": "Morning Loaf", "kind": "bakery", "rating": 4.5, "price": 1, "distance": "0.6 km", "open": false, "hours": "Opens 7 am" }
      ]
    }
  }
}
```

## product-grid

A shopping grid. A `was` price above `price` shows a strike-through and a computed discount. Covers are generated, so skip `image`. The visitor can sort, filter by category and pick two or three items to compare; both Choose and Compare fire `on_choose`.

Props a model fills: `title`, `currency`, `products` (`name`, `brand`, `category`, `price`, `was`, `rating`, `badge`, `color`, `specs`).

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "product-grid",
    "props": {
      "title": "Headphone deals",
      "products": [
        { "id": "h1", "name": "Quietline 700", "brand": "Sonora", "category": "Over-ear", "price": 229, "was": 299, "rating": 4.6, "badge": "Best seller", "color": "slate", "specs": ["30 h battery", "ANC"] },
        { "id": "h2", "name": "Pulse Buds", "brand": "Arcwave", "category": "Earbuds", "price": 79, "was": 99, "rating": 4.3, "color": "violet", "specs": ["IPX4"] }
      ]
    }
  }
}
```

## media-grid

A poster grid for documentaries, films, series, podcasts, books or albums. Posters are generated from the title. `kind` sets the poster shape (square for podcasts and albums). The visitor can add items to a list; bind it to keep that list.

Props a model fills: `title`, `kind`, `items` (`title`, `by`, `year`, `minutes`, `episodes`, `rating`, `genres`, `blurb`, `color`).

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "media-grid",
    "bind": "{state.list}",
    "props": {
      "title": "Ocean documentaries",
      "items": [
        { "id": "d1", "title": "The Deep Blue Hours", "by": "Mara Ellison", "year": 2021, "minutes": 94, "rating": 4.5, "genres": ["Nature"], "color": "teal" },
        { "id": "d2", "title": "Salt and Ice", "by": "Tomas Reyes", "year": 2019, "minutes": 82, "rating": 4.2, "genres": ["Climate"], "color": "blue" }
      ]
    }
  }
}
```

## map in chat cards

`map` now fits inside a chat card. Tiles are OpenStreetMap based and need no key. The widget is forgiving about points: `center` takes `[lat, lng]` or `{ "lat": ..., "lng": ... }`, and so does every marker and path point. For a single line, `route` takes a bare point list, so a model does not have to build a `paths` entry.

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "map",
    "props": {
      "center": { "lat": 38.7135, "lng": -9.1365 },
      "zoom": 15,
      "height": "320px",
      "markers": [
        { "id": "start", "lat": 38.7139, "lng": -9.1394, "label": "Rossio" },
        { "id": "end", "lat": 38.7139, "lng": -9.1334, "label": "Castle" }
      ],
      "route": [[38.7139, -9.1394], [38.7121, -9.1372], [38.7118, -9.1352], [38.7139, -9.1334]]
    }
  }
}
```

## Changes to older widgets

- **model-viewer** takes `asset`, an id from the built-in library of 31 models (for example `plane`, `heart`, `skeleton`, `t-rex`), and `annotations` that pin numbered labels to the model's named points by `anchor`. See [Drawings](/docs/guides/drawings).
- **interval-workout** shows an animated figure for each exercise. The figure is matched from the exercise `name`; set `figure` (an id like `cat-cow`) to pick one yourself.
- **comparison-layout** accepts feature definitions written on each item as well as in `features`, and never prints raw JSON for a value it does not understand.
- **booking** reads open slots per service from `days`, so different services can have different days. With `contact: false` the last step reads "Send to chat" and the request goes to the chat as a message instead of a store; the host shows that with `sent`.
- **stat** rounds plain numbers by size: whole from 100, one decimal from 10, two below that. Set `decimals` to pin the digits.
- **table** wraps long text cells and keeps number columns on one line, aligned right.
- **invoice-layout** reads a summary row's `amount` or `total` as its `value`, takes `amount` for a line's total, formats a three-letter `currency` like `"USD"` as money, and shows a dash instead of `NaN` when a number is missing.

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "flex",
    "props": { "direction": "row", "gap": "12px" },
    "children": [
      { "type": "stat", "props": { "label": "Avg steps", "value": 8971.429 } },
      { "type": "stat", "props": { "label": "Avg sleep", "value": 7.4166, "decimals": 1 } }
    ]
  }
}
```
