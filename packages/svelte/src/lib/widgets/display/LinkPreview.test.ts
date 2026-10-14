// src/lib/widgets/display/LinkPreview.test.ts
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LinkPreview from './LinkPreview.svelte';

describe('LinkPreview', () => {
  it('shows the domain letter tile, not an image, when the image is refused', () => {
    const { container } = render(LinkPreview, {
      props: { url: 'https://journal.northwind.example/notes', title: 'Field notes', image: 'javascript:alert(1)' }
    });
    expect(container.querySelector('img')).toBeNull();
    const tile = container.querySelector('[data-state="fallback"]');
    expect(tile?.textContent?.trim()).toBe('J');
  });
});
