// @file widgets/display/accent-atoms.test.ts
// @description Behaviour of the accent atoms on odd input: Badge, Chip and
//   Mention render nothing rather than an empty pill, keep long labels whole in
//   `title`, never double the @, and never turn an unsafe href into a link.
//   Contrast of their text lives in ui/status-text.test.ts.
import { render } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';
import Badge from './Badge.svelte';
import Chip from './Chip.svelte';
import Mention from './Mention.svelte';
import Button from '$lib/widgets/input/Button.svelte';

test('Badge with no text renders nothing; a long text wraps whole', () => {
  expect(render(Badge, { props: {} }).container.textContent?.trim()).toBe('');
  const long = 'Waiting on legal review before the regional launch can go ahead';
  const { container } = render(Badge, { props: { text: long } });
  const pill = container.querySelector('[data-slot="badge"]')!;
  expect(pill.textContent?.trim()).toBe(long);
  expect(pill.className).toContain('text-ripple-accent-text');
  expect(pill.className).toContain('whitespace-normal');
  expect(pill.className).not.toContain('whitespace-nowrap');
});

test('Chip with no label and no children renders nothing, even when closable', () => {
  const { container } = render(Chip, { props: { variant: 'primary', closable: true } });
  expect(container.querySelector('span, button')).toBeNull();
});

test('Chip coerces a numeric label and names its remove button', async () => {
  const onclose = vi.fn();
  const { container, getByRole } = render(Chip, {
    props: { label: 42 as unknown as string, variant: 'primary', closable: true, onclose },
  });
  expect(container.textContent).toContain('42');
  expect(container.firstElementChild?.className).toContain('text-ripple-accent-text');
  getByRole('button', { name: 'Remove 42' }).click();
  expect(onclose).toHaveBeenCalledTimes(1);
});

test('Mention strips a leading @ and renders nothing without a name', () => {
  expect(render(Mention, { props: { name: '@dana' } }).container.textContent?.trim()).toBe('@dana');
  expect(render(Mention, { props: { name: '' } }).container.textContent?.trim()).toBe('');
});

test('Mention with an unsafe href is a plain pill, not a link', () => {
  const { container } = render(Mention, { props: { name: 'lee', href: 'javascript:alert(1)' } });
  expect(container.querySelector('a')).toBeNull();
  expect(container.textContent?.trim()).toBe('@lee');
});

test('Mention with a safe href is a link that underlines on hover', () => {
  const { container } = render(Mention, { props: { name: 'alice', href: 'https://example.com/alice' } });
  const a = container.querySelector('a')!;
  expect(a.getAttribute('href')).toBe('https://example.com/alice');
  expect(a.className).toContain('hover:underline');
  expect(a.className).toContain('text-ripple-accent-text');
});

test('link Button wraps a long label and uses the accent text token', () => {
  const { container } = render(Button, { props: { label: 'View the full planning history', variant: 'link' } });
  const b = container.querySelector('button')!;
  expect(b.className).toContain('whitespace-normal');
  expect(b.className).toContain('text-ripple-accent-text');
  expect(b.className).not.toMatch(/\btext-primary(?![\w-])/);
});
