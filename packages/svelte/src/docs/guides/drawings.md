---
title: Drawings
description: When to use illustration, iso-scene, figure or model-viewer to explain how something looks or works, and what a model writes for each.
order: 11
---

Ripple has four ways to draw. They differ in who builds the picture and how much it can move.

| Widget | Who builds it | Moves | Good for |
| --- | --- | --- | --- |
| `illustration` | The model writes SVG | SVG animation | Simple diagrams, icons in motion, a sun over hills |
| `iso-scene` | The model writes a parts list | Live, driven by sliders | Machines and systems: gears, pumps, engines |
| `figure` | Hand-built, picked by id | Live, driven by sliders | Topics we drew by hand so they always look right |
| `model-viewer` | A 3D file from the library | The reader orbits it | Real objects: a plane, a heart, a skeleton |

Pick in this order: a `figure` if one exists for the topic, a `model-viewer` asset if the reader needs to see the real shape, an `iso-scene` when the point is how parts move together, and an `illustration` for anything else.

## illustration

The model writes a small `<svg viewBox>` with shapes, gradients and `animate` or `animateTransform`. Scripts, styles, links, images and filters are stripped. `annotations` pin numbered notes on parts of the drawing. It is the most flexible option and the one most likely to look rough, because the model draws every line.

## iso-scene

A live isometric drawing built from a parts list. The model never writes coordinates for pixels, only for parts in a small 3D space, and the kit draws them in the same soft isometric style every time.

- **parts**: up to 150 of `slab`, `box`, `cylinder`, `disc`, `gear`, `tube`, `sphere`, `cone`, `rod`, `arrow` and `plate`. `at` is the centre, `z` is up. `on` makes a part move with a parent.
- **motions**: `spin`, `slide`, `swing`, `pulse` or `flow` on a part. `speed` is turns per second, as a number or an expression over params like `"cadence / 60"`.
- **params**: up to 6 sliders. Each `key` can be used in speeds and readouts.
- **readouts**: up to 4 live numbers, each an expression over params.
- **labels**: up to 10 numbered pins on a part or a point, listed with their notes under the drawing.
- **look**: `soft` (the default, near white parts) or `color`.

Move the slider:

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "iso-scene",
    "bind": "{state.gears}",
    "props": {
      "title": "Two gears",
      "params": [{ "key": "speed", "label": "Input speed", "min": 10, "max": 120, "step": 5, "unit": "rpm", "value": 40 }],
      "parts": [
        { "id": "base", "kind": "slab", "at": [20, 0, -4], "w": 120, "d": 60, "h": 4, "r": 6 },
        { "id": "big", "kind": "gear", "at": [0, 0, 6], "r": 30, "h": 6, "teeth": 30, "color": "metal" },
        { "id": "small", "kind": "gear", "at": [44, 0, 6], "r": 15, "h": 6, "teeth": 15, "color": "accent" }
      ],
      "motions": [
        { "part": "big", "kind": "spin", "speed": "speed / 60" },
        { "part": "small", "kind": "spin", "speed": "speed / 60 * -2", "phase": 0.03 }
      ],
      "readouts": [{ "label": "Output speed", "value": "speed * 2", "unit": "rpm", "decimals": 0 }],
      "labels": [
        { "part": "big", "label": "Driver", "note": "30 teeth" },
        { "part": "small", "label": "Driven", "note": "15 teeth, twice as fast" }
      ]
    }
  }
}
```

The drawing kit lives in `@ripple-ui/core/iso`, so a host can use it without Svelte.

## figure

A figure is an iso drawing we built by hand and ship by id. The model picks it, sets starting slider values in `params`, and pins labels on its named anchors. It cannot get the drawing wrong because it does not draw it.

The catalog has one figure so far, `heart`: a beating heart as two pumps, with sliders for heart rate (`bpm`, 40 to 180) and stroke volume (`stroke`, 50 to 110 ml). Its anchors are `right-atrium`, `right-ventricle`, `left-atrium`, `left-ventricle`, `tricuspid`, `mitral`, `pulmonary-valve`, `aortic-valve`, `aorta`, `vena-cava`, `pulmonary-artery`, `pulmonary-veins`, `lungs` and `body`.

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "figure",
    "bind": "{state.figure}",
    "props": {
      "figure": "heart",
      "params": { "bpm": 72 },
      "labels": [
        { "anchor": "right-ventricle", "note": "Pumps blood to the lungs." },
        { "anchor": "left-ventricle", "note": "Pumps blood to the whole body." }
      ],
      "caption": "Move the heart rate and watch the output change."
    }
  }
}
```

### Checking a figure: audit, review sheet and score

Three tools check a curated figure before it ships. Bike gears is the first figure wired to them; a figure joins by exporting `review` from its `figure.ts` (audit frames, waivers, its SVG per theme and the junctions to inspect).

- **Audit** (`auditSvg` from `@ripple-ui/core/iso`, pure). It reads the kit's own SVG and runs two checks. `supports`: every solid rests on another solid or the ground through a chain of contacts, or is marked `data-floating`. A solid the figure did not measure fails. `loose-ends`: every open line end lands within 1 viewBox px of another stroke or a dot, or is hidden under a fill painted after it. Each check returns `{ check, count, items }`, and 0 is a pass. A figure gives the audit its solids by writing `data-shape` (from `shapeAttr`) on each solid group, only when it renders for an audit. Faults that are fine on purpose go in the figure's waiver list with a reason. The figure's audit test fails on any unwaived fault, and on any waiver whose fault is gone.
- **Review sheet** (`bun run review:figure bike-gears` in `packages/svelte`). It renders the figure in light and dark, the whole figure at 2x and each named junction at 4x, and writes one contact sheet to `review/<id>/contact-sheet.png`. Read it in a fixed order: line ends, tone steps, overlaps, empty corners. The committed sheet is the baseline.
- **Score** (`bun run score:figure bike-gears`). It prints audit faults and waivers per check, solid, path and dot counts, render and audit time, and a cost line (pass `--tokens` and `--minutes` when you know them). The score is 100, minus 10 per unwaived fault, minus 2 per waiver. It exits 1 on any unwaived fault.

## model-viewer

A 3D model the reader can orbit. Set `asset` to an id from the built-in library and the file, camera and label points come with it. Use `src` only when no asset fits.

The library has 31 models: astronaut, boombox, camera, car, chair, dog, fish, fox, globe, guitar, headphones, heart, helicopter, helmet, house, human, lantern, lighthouse, motorcycle, plane, robot, rocket, ship, skeleton, skull, sneaker, t-rex, telescope, train, tree and whale.

`annotations` pin up to 12 numbered labels. On an asset, `anchor` names one of its measured points and `label` defaults to that point's name. Unknown anchors are dropped, so a model that guesses wrong gets fewer labels, not broken ones.

```ripple
{
  "version": "1.0",
  "state": {},
  "ui": {
    "type": "model-viewer",
    "props": {
      "asset": "plane",
      "annotations": [
        { "anchor": "cockpit" },
        { "anchor": "engine", "note": "Each wingtip motor turns a propeller." },
        { "anchor": "tail" }
      ]
    }
  }
}
```

## Credits

- The isometric drawing kit in `@ripple-ui/core/iso` is ported from [Anatomy](https://skills.wheresryan.sh/anatomy) by Ryan ([source](https://github.com/wheresryan22/anatomy)), MIT License. The full license text and the list of files it covers are in `THIRD_PARTY_NOTICES.md` at the repo root.
- The 3D models come from Quaternius, Kenney, CreativeTrio and other authors on [Poly Pizza](https://poly.pizza), the [Khronos glTF sample assets](https://github.com/KhronosGroup/glTF-Sample-Assets), [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) and [NIH 3D](https://3d.nih.gov). All are CC0 or public domain except the sneaker (Shopify, CC BY 4.0). Every file, author and licence is listed in `static/models/CREDITS.md`.
