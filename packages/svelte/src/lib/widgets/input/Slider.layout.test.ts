// widgets/input/Slider.layout.test.ts: the slider's thumb sits inside the
// widget's own box. bits-ui positions the thumb absolutely, so with only the
// 4px track in flow the 12px thumb hung over the next widget's label (live
// chip audit, watch savings grow: the Years thumb sat on "Balance after 10
// years"). jsdom has no layout, so this pins the class that reserves the room.
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Ripple from '$lib/Ripple.svelte';
import { watchSavingsGrow } from '../__fixtures__/live-chip-specs.js';

afterEach(cleanup);

test('watch-savings-grow spec: each slider root is at least as tall as its thumb', () => {
  const { container } = render(Ripple, { props: { spec: watchSavingsGrow } });
  const roots = [...container.querySelectorAll('[data-slot="slider"]')];
  expect(roots.length).toBe(2);
  for (const r of roots) expect(r.className).toMatch(/(^|\s)min-h-4(\s|$)/);
});

test('watch-savings-grow spec: growth-projection controls stay labelled', () => {
  render(Ripple, { props: { spec: watchSavingsGrow } });
  const section = screen.getByRole('region', { name: 'Try other numbers' });
  for (const name of ['Monthly deposit', 'Interest rate', 'Years']) {
    expect(section.querySelector(`input[type="range"][aria-label="${name}"]`)).not.toBeNull();
    const label = [...section.querySelectorAll('label')].find((l) => l.textContent === name);
    expect(label && section.querySelector(`#${CSS.escape(label.htmlFor)}`)).toBeTruthy();
  }
});
