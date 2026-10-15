<!-- docs/figure-review.md: contributor tooling that checks a hand-built figure
     (packages/svelte/src/lib/figures) before it ships. Repo-only; the public
     Drawings guide covers using figures. -->
# Checking a figure: audit, review sheet and score

Three tools check a curated figure before it ships. Bike gears is the one figure wired to them so far; a figure joins by exporting `review` from its `figure.ts` (audit frames, waivers, its SVG per theme and the junctions to inspect).

- **Audit** (`auditSvg` from `@ripple-ui/core/iso`, pure). It reads the kit's own SVG and runs two checks. `supports`: every solid rests on another solid or the ground through a chain of contacts, or is marked `data-floating`. A solid the figure did not measure fails. `loose-ends`: every open line end lands within 1 viewBox px of another stroke or a dot, or is hidden under a fill painted after it. Each check returns `{ check, count, items }`, and 0 is a pass. A figure gives the audit its solids by writing `data-shape` (from `shapeAttr`) on each solid group, only when it renders for an audit. Faults that are fine on purpose go in the figure's waiver list with a reason. The figure's audit test fails on any unwaived fault, and on any waiver whose fault is gone.
- **Review sheet** (`bun run review:figure bike-gears` in `packages/svelte`). It renders the figure in light and dark, the whole figure at 2x and each named junction at 4x, and writes one contact sheet to `review/<id>/contact-sheet.png`. Read it in a fixed order: line ends, tone steps, overlaps, empty corners. The committed sheet is the baseline.
- **Score** (`bun run score:figure bike-gears`). It prints audit faults and waivers per check, solid, path and dot counts, render and audit time, and a cost line (pass `--tokens` and `--minutes` when you know them). The score is 100, minus 10 per unwaived fault, minus 2 per waiver. It exits 1 on any unwaived fault.

