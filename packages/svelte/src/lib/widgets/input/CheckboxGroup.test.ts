// src/lib/widgets/input/CheckboxGroup.test.ts
// @file widgets/input/CheckboxGroup.test.ts
// @description jsdom unit coverage for CheckboxGroup: one role=checkbox row
//   per option, aria-checked reflects the bound value array, onchange emits the
//   toggled array, the gliding hover highlight appears on hover, and a checked
//   row paints no fill of its own. jsdom has no layout engine (offset* = 0), so
//   the pixel glide is proven in e2e/motion.spec.ts (real Chromium).

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CheckboxGroup from './CheckboxGroup.svelte';

const OPTS = ['Apples', 'Bananas', 'Cherries', 'Dates'];

describe('CheckboxGroup', () => {
  it('renders one role=checkbox row per option', () => {
    const { container } = render(CheckboxGroup, { props: { options: OPTS } });
    const rows = container.querySelectorAll('[data-checkbox-group-item]');
    expect(rows.length).toBe(4);
    // Each row carries role=checkbox for AT exposure.
    expect(container.querySelectorAll('[role="checkbox"][data-checkbox-group-item]').length).toBe(4);
  });

  it('reflects the bound value array via aria-checked', () => {
    const { container } = render(CheckboxGroup, {
      props: { options: OPTS, value: ['Bananas', 'Dates'] }
    });
    const rows = Array.from(container.querySelectorAll('[data-checkbox-group-item]'));
    expect(rows[0].getAttribute('aria-checked')).toBe('false'); // Apples
    expect(rows[1].getAttribute('aria-checked')).toBe('true'); // Bananas
    expect(rows[2].getAttribute('aria-checked')).toBe('false'); // Cherries
    expect(rows[3].getAttribute('aria-checked')).toBe('true'); // Dates
  });

  it('emits onchange ADDING a value when an unchecked row is clicked', async () => {
    const onchange = vi.fn();
    const { container } = render(CheckboxGroup, {
      props: { options: OPTS, value: ['Apples'], onchange }
    });
    const rows = container.querySelectorAll('[data-checkbox-group-item]');
    await fireEvent.click(rows[2]); // Cherries
    expect(onchange).toHaveBeenCalledWith(['Apples', 'Cherries']);
  });

  it('emits onchange REMOVING a value when a checked row is clicked', async () => {
    const onchange = vi.fn();
    const { container } = render(CheckboxGroup, {
      props: { options: OPTS, value: ['Apples', 'Bananas'], onchange }
    });
    const rows = container.querySelectorAll('[data-checkbox-group-item]');
    await fireEvent.click(rows[0]); // un-check Apples
    expect(onchange).toHaveBeenCalledWith(['Bananas']);
  });

  it('toggles on Space / Enter keydown', async () => {
    const onchange = vi.fn();
    const { container } = render(CheckboxGroup, {
      props: { options: OPTS, value: [], onchange }
    });
    const rows = container.querySelectorAll('[data-checkbox-group-item]');
    await fireEvent.keyDown(rows[1], { key: ' ' });
    expect(onchange).toHaveBeenCalledWith(['Bananas']);
  });

  it('does not emit when disabled', async () => {
    const onchange = vi.fn();
    const { container } = render(CheckboxGroup, {
      props: { options: OPTS, disabled: true, onchange }
    });
    const rows = container.querySelectorAll('[data-checkbox-group-item]');
    await fireEvent.click(rows[0]);
    expect(onchange).not.toHaveBeenCalled();
  });

  it('shows the gliding hover highlight element only while an UNSELECTED item is hovered', async () => {
    const { container } = render(CheckboxGroup, { props: { options: OPTS } });
    // No highlight at rest.
    expect(container.querySelector('[data-checkbox-group-highlight]')).toBeNull();
    // Hovering the group activates the nearest item → the highlight mounts.
    const group = container.querySelector('[role="group"]')!;
    await fireEvent.pointerMove(group, { clientY: 10 });
    // rAF-throttled — flush a frame.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(container.querySelector('[data-checkbox-group-highlight]')).not.toBeNull();
  });

  it('paints no fill behind checked rows: the box carries the state', () => {
    const { container } = render(CheckboxGroup, {
      props: { options: OPTS, value: ['Apples', 'Bananas', 'Dates'] }
    });
    expect(container.querySelector('[data-checkbox-group-merged]')).toBeNull();
    const rows = container.querySelectorAll('[data-checkbox-group-item]');
    // No row inset: the box sits on the group label's left edge.
    for (const row of rows) expect(row.className).not.toMatch(/\bpx-/);
  });

  it('shows the hover highlight when an UNCHECKED row is hovered next to a selected block', async () => {
    // Mixed selection: index 0 checked, the rest unchecked. Hovering lands on the
    // nearest row; when it is UNCHECKED the hover highlight mounts (the affordance
    // still works for unselected rows — only selected rows suppress it).
    const onchange = vi.fn();
    const { container } = render(CheckboxGroup, {
      props: { options: OPTS, value: [OPTS[0]], onchange }
    });
    const group = container.querySelector('[role="group"]')!;
    // Activate an unchecked row directly via focus (deterministic in jsdom — focus
    // sets activeIndex to that row's index without depending on zero-size geometry).
    const rows = container.querySelectorAll('[data-checkbox-group-item]');
    await fireEvent.focus(rows[2]); // Cherries — unchecked
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(container.querySelector('[data-checkbox-group-highlight]')).not.toBeNull();
  });

  it('the hover highlight transition honors the FF fast token (80ms glide)', async () => {
    const { container } = render(CheckboxGroup, { props: { options: OPTS } });
    const group = container.querySelector('[role="group"]')!;
    await fireEvent.pointerMove(group, { clientY: 10 });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const hl = container.querySelector('[data-checkbox-group-highlight]') as HTMLElement;
    // The signature 80ms snap must be on the positional properties — this is the
    // "Apple-level" timing the whole port is about. Assert it's wired through.
    const transition = hl.getAttribute('style') ?? '';
    expect(transition).toContain('top 80ms');
    expect(transition).toContain('width 80ms');
  });
});
