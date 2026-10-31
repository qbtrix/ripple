// discover/LiveFrame.test.ts — the client half of the live frame and the card
// open path: LiveFrame creates its iframe only after the load button is
// pressed (or at once with `autoload`), with allow-same-origin only on a pawsites subdomain, and the width toggle
// for sites; the overlay's See full page hands a plain click to `onpage`; a card with `onopen` takes a plain click on its title and lets a
// modified click through to the link; the card ⋯ menu opens and calls back, or links with `remixHref`.
// Runs in the `client` vitest project.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import DiscoverTile from './DiscoverTile.svelte';
import ItemDetail from './ItemDetail.svelte';
import LiveFrame from './LiveFrame.svelte';
import type { DiscoverItem } from './types.js';

afterEach(cleanup);

const base = { url: 'https://dentist.pawsites.workers.dev', title: 'Bright Smile', poster: null, tint: 'var(--ripple-accent)', initial: 'B' };

describe('LiveFrame', () => {
  it('loads nothing until the button is pressed', async () => {
    const { container, getByRole } = render(LiveFrame, { ...base, kind: 'site' });
    expect(container.querySelector('iframe')).toBeNull();
    await fireEvent.click(getByRole('button', { name: 'Load site: Bright Smile' }));
    const frame = container.querySelector('iframe')!;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('src')).toBe('https://dentist.pawsites.workers.dev/');
    // A pawsites subdomain keeps its own origin, and so its storage.
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups allow-pointer-lock allow-same-origin');
    expect(frame.getAttribute('allow')).toBe('fullscreen; gamepad; autoplay');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('title')).toBe('Bright Smile');
  });

  it.each(['https://pawsites.workers.dev.evil.com/', 'http://x.pawsites.workers.dev/', 'https://example.com/', 'https://pawsites.workers.dev/'])(
    'a frame on %s stays opaque',
    async (url) => {
      const { container, getByRole } = render(LiveFrame, { ...base, url, kind: 'game' });
      await fireEvent.click(getByRole('button', { name: /Play/ }));
      expect(container.querySelector('iframe')!.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups allow-pointer-lock');
    },
  );

  it('a site gets the Desktop / Phone toggle once loaded', async () => {
    const { container, getByRole, queryByRole } = render(LiveFrame, { ...base, kind: 'site' });
    expect(queryByRole('button', { name: /Phone/ })).toBeNull();
    await fireEvent.click(getByRole('button', { name: /Load site/ }));
    const phone = getByRole('button', { name: /Phone/ });
    await fireEvent.click(phone);
    expect(phone.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('iframe')!.parentElement!.className).toContain('w-[390px]');
  });

  it('autoload renders the frame without a click and keeps the width toggle; default stays click-to-load', async () => {
    const { container, getByRole, queryByRole } = render(LiveFrame, { ...base, kind: 'site', autoload: true });
    expect(container.querySelector('iframe')!.getAttribute('src')).toBe('https://dentist.pawsites.workers.dev/');
    expect(queryByRole('button', { name: /Load site/ })).toBeNull();
    await fireEvent.click(getByRole('button', { name: /Phone/ }));
    expect(container.querySelector('iframe')).not.toBeNull();
    cleanup();
    const lazy = render(LiveFrame, { ...base, kind: 'site', autoload: false });
    expect(lazy.container.querySelector('iframe')).toBeNull();
    expect(lazy.getByRole('button', { name: /Load site/ })).toBeTruthy();
  });

  it('labels the button by kind, and a game gets no width toggle', async () => {
    const { getByRole, queryByRole } = render(LiveFrame, { ...base, kind: 'game', title: 'Snake' });
    await fireEvent.click(getByRole('button', { name: 'Play: Snake' }));
    expect(queryByRole('button', { name: /Phone/ })).toBeNull();
    cleanup();
    expect(render(LiveFrame, { ...base, kind: 'tool', title: 'Calc' }).getByRole('button', { name: 'Open tool: Calc' })).toBeTruthy();
  });
});

describe('card onopen', () => {
  const item: DiscoverItem = { id: 'g', slug: 'snake', kind: 'game', mediaKind: null, title: 'Snake', desc: '', imageUrl: null, liveUrl: null, remixCount: 0, featured: false };

  it('a plain click on the title opens in place; a ctrl-click follows the link', async () => {
    const onopen = vi.fn();
    const { getByRole } = render(DiscoverTile, { item, href: '/discover/snake', onopen });
    const link = getByRole('link', { name: 'Snake' });
    const plain = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(plain);
    expect(onopen).toHaveBeenCalledWith(item);
    expect(plain.defaultPrevented).toBe(true);
    const ctrl = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    link.dispatchEvent(ctrl);
    expect(onopen).toHaveBeenCalledTimes(1);
    expect(ctrl.defaultPrevented).toBe(false);
  });
});

describe('card ⋯ menu', () => {
  const item: DiscoverItem = { id: 't', slug: 'calc', kind: 'tool', mediaKind: null, title: 'Calc', desc: '', imageUrl: null, liveUrl: null, remixCount: 0, featured: false };

  it('opens from the keyboard and calls Report and Copy link', async () => {
    const onreport = vi.fn();
    const oncopylink = vi.fn();
    const { getByRole } = render(DiscoverTile, { item, href: '/discover/calc', onreport, oncopylink });
    const trigger = getByRole('button', { name: 'More for Calc' });
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: 'Enter' });
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }));
    expect(oncopylink).toHaveBeenCalledWith(item, '/discover/calc');
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: 'Enter' });
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Report' }));
    expect(onreport).toHaveBeenCalledWith(item);
  });

  it('draws Remix as a link to remixHref, which wins over onremix', async () => {
    const onremix = vi.fn();
    const { getByRole } = render(DiscoverTile, { item, remixHref: 'https://app.example.com/remix/calc', onremix });
    const trigger = getByRole('button', { name: 'More for Calc' });
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: 'Enter' });
    const remix = await screen.findByRole('menuitem', { name: 'Remix' });
    expect(remix.tagName).toBe('A');
    expect(remix.getAttribute('href')).toBe('https://app.example.com/remix/calc');
    await fireEvent.click(remix);
    expect(onremix).not.toHaveBeenCalled();
  });
});

describe('overlay See full page', () => {
  const item: DiscoverItem = { id: 's', slug: 'dentist', kind: 'site', mediaKind: null, title: 'Dentist', desc: '', imageUrl: null, liveUrl: 'https://dentist.pawsites.workers.dev', remixCount: 0, featured: false };

  it('a plain click goes to onpage; a ctrl-click follows the link', () => {
    const onpage = vi.fn();
    const { getByRole } = render(ItemDetail, { item, layout: 'overlay', pageHref: '/discover/dentist', onpage });
    const link = getByRole('link', { name: 'See full page' });
    expect(link.getAttribute('href')).toBe('/discover/dentist');
    const plain = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(plain);
    expect(onpage).toHaveBeenCalledWith(item);
    expect(plain.defaultPrevented).toBe(true);
    const ctrl = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    link.dispatchEvent(ctrl);
    expect(onpage).toHaveBeenCalledTimes(1);
    expect(ctrl.defaultPrevented).toBe(false);
  });
});
