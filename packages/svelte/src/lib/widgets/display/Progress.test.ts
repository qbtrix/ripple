// src/lib/widgets/display/Progress.test.ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Progress from './Progress.svelte';

describe('Progress', () => {
  it('renders a label row with a rounded percent when label is set', () => {
    const { container } = render(Progress, { props: { value: 64, max: 80, label: 'Seats used' } });
    expect(container.textContent).toContain('Seats used');
    expect(container.textContent).toContain('80%');
  });

  it('renders a bare bar without a label', () => {
    const { container } = render(Progress, { props: { value: 37 } });
    expect(container.textContent?.trim()).toBe('');
    expect(container.querySelector('[data-slot="progress"]')).not.toBeNull();
  });
});
