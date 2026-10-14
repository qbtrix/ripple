// src/lib/widgets/display/ArticleMeta.test.ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ArticleMeta from './ArticleMeta.svelte';

describe('ArticleMeta', () => {
  it('keeps date and read time in one nowrap unit so neither is orphaned', () => {
    const { getByText } = render(ArticleMeta, {
      props: { author: 'Sam Ito', date: 'October 14, 2026', readTime: '14 min read' }
    });
    const unit = getByText('October 14, 2026').parentElement!.parentElement!;
    expect(unit.className).toContain('whitespace-nowrap');
    expect(unit.textContent).toContain('14 min read');
  });

  it('shows tinted initials, not an image, when the avatar URL is refused', () => {
    const { container } = render(ArticleMeta, { props: { author: 'Sam Ito', avatar: 'javascript:alert(1)' } });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('SI');
  });
});
