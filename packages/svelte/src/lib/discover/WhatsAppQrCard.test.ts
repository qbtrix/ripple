// discover/WhatsAppQrCard.test.ts — the hydrated WhatsApp QR card: on mount the
// example number clears and the country follows the browser; the shop name and
// number update the preview and the wa.me link; until the number is valid there is
// no QR, no link and every export is disabled; a pasted international number picks
// its country; the exports, copy and "Test it" go through the host callbacks (or the
// defaults); the make action calls back with the shop. Runs in the `client` project;
// the canvas and the print iframe are mocked at the export module.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

const exp = vi.hoisted(() => ({
  cardPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  printCard: vi.fn(),
  downloadBlob: vi.fn(),
}));
vi.mock('./whatsapp-card-export.js', async (orig) => ({ ...(await orig<object>()), ...exp }));

import WhatsAppQrCard from './WhatsAppQrCard.svelte';

const phone = () => screen.getByLabelText('WhatsApp number') as HTMLInputElement;
const type = (el: HTMLElement, value: string) => fireEvent.input(el, { target: { value } });
const languages = (value: string[]) => Object.defineProperty(navigator, 'languages', { value, configurable: true });

beforeEach(() => {
  vi.clearAllMocks();
  languages(['en-IN']);
});
afterEach(cleanup);

describe('WhatsAppQrCard', () => {
  it('starts with no number once mounted: a placeholder, no link, exports disabled', () => {
    render(WhatsAppQrCard);
    expect(phone().value).toBe('');
    expect(screen.getByTestId('discover-qr-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('discover-qr-code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('discover-qr-link')).not.toBeInTheDocument();
    for (const id of ['discover-qr-png', 'discover-qr-svg', 'discover-qr-print']) expect(screen.getByTestId(id)).toBeDisabled();
    expect(screen.getByTestId('discover-qr-country')).toHaveTextContent('IN +91');
  });

  it('defaults the country from the browser languages', () => {
    languages(['en-GB', 'en']);
    render(WhatsAppQrCard);
    expect(screen.getByTestId('discover-qr-country')).toHaveTextContent('GB +44');
  });

  it('typing the shop and a number updates the preview and the link', async () => {
    render(WhatsAppQrCard);
    await type(screen.getByLabelText('Shop name'), 'Mehta Dairy');
    await type(phone(), '98765 43210');
    expect(screen.getByTestId('discover-qr-shop')).toHaveTextContent('Mehta Dairy');
    expect(screen.getByTestId('discover-qr-line')).toHaveTextContent('+91 98765 43210');
    expect(screen.getByTestId('discover-qr-code')).toBeInTheDocument();
    expect(screen.getByTestId('discover-qr-link')).toHaveTextContent(
      "https://wa.me/919876543210?text=Hi!%20I'd%20like%20to%20place%20an%20order.",
    );
    expect(screen.getByTestId('discover-qr-png')).toBeEnabled();
    await type(screen.getByLabelText(/First message/), '');
    expect(screen.getByTestId('discover-qr-link')).toHaveTextContent(/^https:\/\/wa\.me\/919876543210$/);
  });

  it('an invalid number shows why after leaving the field, and disables the exports', async () => {
    render(WhatsAppQrCard);
    await type(phone(), '987');
    await fireEvent.blur(phone());
    expect(screen.getByText('That number looks too short.')).toBeInTheDocument();
    expect(phone()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('discover-qr-png')).toBeDisabled();
    expect(screen.queryByTestId('discover-qr-code')).not.toBeInTheDocument();
  });

  it('a pasted international number picks its country', async () => {
    render(WhatsAppQrCard);
    await type(phone(), '+44 7700 900123');
    expect(screen.getByTestId('discover-qr-country')).toHaveTextContent('GB +44');
    expect(phone().value).toBe('7700900123');
    expect(screen.getByTestId('discover-qr-link')).toHaveTextContent('https://wa.me/447700900123?');
  });

  it('exports, copy and "Test it" go through the host callbacks', async () => {
    const ondownload = vi.fn();
    const oncopy = vi.fn(async () => undefined);
    const onopenlink = vi.fn();
    render(WhatsAppQrCard, { ondownload, oncopy, onopenlink });
    await type(phone(), '9876543210');
    await fireEvent.click(screen.getByTestId('discover-qr-png'));
    await vi.waitFor(() => expect(ondownload).toHaveBeenCalledWith(expect.any(Blob), 'sharma-sweets-whatsapp-qr.png'));
    expect(exp.cardPng).toHaveBeenCalledWith(expect.objectContaining({ width: 148, height: 105 }));
    await fireEvent.click(screen.getByTestId('discover-qr-svg'));
    const svg = ondownload.mock.calls[1] as [Blob, string];
    expect(svg[1]).toBe('sharma-sweets-whatsapp-qr.svg');
    expect(svg[0].type).toBe('image/svg+xml');
    await fireEvent.click(screen.getByTestId('discover-qr-print'));
    expect(exp.printCard).toHaveBeenCalledWith(expect.objectContaining({ width: 148 }), 'Sharma Sweets WhatsApp QR card');
    const link = screen.getByTestId('discover-qr-link').textContent;
    await fireEvent.click(screen.getByRole('button', { name: 'Copy the WhatsApp link' }));
    expect(oncopy).toHaveBeenCalledWith(link);
    await fireEvent.click(screen.getByRole('button', { name: /Test it/ }));
    expect(onopenlink).toHaveBeenCalledWith(link);
    expect(exp.downloadBlob).not.toHaveBeenCalled();
  });

  it('without callbacks: the default download, and "Test it" is a new-tab link', async () => {
    render(WhatsAppQrCard);
    await type(phone(), '9876543210');
    await fireEvent.click(screen.getByTestId('discover-qr-svg'));
    expect(exp.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'sharma-sweets-whatsapp-qr.svg');
    const test = screen.getByRole('link', { name: /Test it/ });
    expect(test).toHaveAttribute('href', screen.getByTestId('discover-qr-link').textContent);
    expect(test).toHaveAttribute('target', '_blank');
  });

  it('a failed PNG says so', async () => {
    exp.cardPng.mockRejectedValueOnce(new Error('no canvas'));
    render(WhatsAppQrCard, { ondownload: vi.fn() });
    await type(phone(), '9876543210');
    await fireEvent.click(screen.getByTestId('discover-qr-png'));
    expect(await screen.findByRole('status')).toHaveTextContent("Couldn't make the PNG");
  });

  it('the make action calls back with the shop, and is absent without one', async () => {
    const onmake = vi.fn();
    render(WhatsAppQrCard, { onmake, brand: 'Paw OS' });
    await type(screen.getByLabelText('Shop name'), 'Mehta Dairy');
    await fireEvent.click(screen.getByRole('button', { name: 'Make a full menu or site with Paw OS' }));
    expect(onmake).toHaveBeenCalledWith('Mehta Dairy');
    cleanup();
    render(WhatsAppQrCard);
    expect(screen.queryByText(/Make a full menu or site/)).not.toBeInTheDocument();
  });
});
