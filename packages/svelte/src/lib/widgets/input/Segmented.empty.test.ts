// src/lib/widgets/input/Segmented.empty.test.ts
// Empty single-mode value: by default the first enabled option is committed on
// mount; with `allowEmpty` the control stays unset until the user picks.
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import Segmented from './Segmented.svelte';

const options = ['A', 'B', 'C'];

describe('Segmented empty value', () => {
  it('default: commits the first enabled option on mount', () => {
    const onchange = vi.fn();
    const { container } = render(Segmented, { props: { options, value: null, onchange } });
    flushSync();
    expect(onchange).toHaveBeenCalledWith('A');
    const radios = container.querySelectorAll('[role="radio"]');
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
  });

  it('allowEmpty: does not call onchange on mount and checks no radio', () => {
    const onchange = vi.fn();
    const { container } = render(Segmented, {
      props: { options, value: null, allowEmpty: true, onchange }
    });
    flushSync();
    expect(onchange).not.toHaveBeenCalled();
    const radios = [...container.querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false']);
    // Roving tab stop still lands on the first enabled option.
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('allowEmpty: clicking an option calls onchange with that value', async () => {
    const onchange = vi.fn();
    const { getByText } = render(Segmented, {
      props: { options, value: null, allowEmpty: true, onchange }
    });
    await fireEvent.click(getByText('B'));
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledWith('B');
  });
});
