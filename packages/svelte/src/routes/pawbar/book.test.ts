// routes/pawbar/book.test.ts — The landing's store host events, fetch mocked.
// book.ts: the host's re-check of a BookingRequest, every store answer
// (201 / 409 slot_taken / 400 / 429 / 5xx / network), the slot reload, the spec
// patch and the .ics file. ChatSession: `checkout` and `book` from a final card
// reach the store (inert while streaming or without a StoreHost), one at a time,
// and the answer lands in the booking node's props and the card's receipt. A
// booking the store does not back (no `on_book`) sends the chosen slot to the
// chat as the visitor's message instead, once, and shows "Sent to chat".

import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { RippleEvent } from '$lib/index.js';
import Ripple from '$lib/Ripple.svelte';
import { book, bookingIcs, patchBooking, reloadDays, SLOT_MESSAGE_MAX, SLOT_TAKEN, slotMessage, toBookingRequest } from './book.js';
import { BOOK_CHAT, refuseCard } from './card-policy.js';
import { ChatSession, type Card, type Transport } from './session.svelte.js';
import { ORDER_KEY } from '../pay/resume.js';

const STORE = 'http://store.test/test-store';
const START = '2026-10-16T19:00:00-04:00';
const request = { service_id: 'table', start: START, party: 4, customer: { name: 'Sam', email: 'sam@example.com', phone: '555 0100' } };
const reply = (status: number, json: unknown) => vi.fn(async (..._: unknown[]) => new Response(JSON.stringify(json), { status }));
const confirmed = { booking_id: 'BK-1A2B3C4D', status: 'confirmed', start: START, label: '7:00 PM', date_label: 'Fri 16 Oct', service_name: 'Table reservation', party: 4 };

describe('toBookingRequest', () => {
	test('keeps a valid request, trimmed, with only the contact given', () => {
		expect(toBookingRequest({ ...request, customer: { name: ' Sam ', email: '', phone: '555 0100' }, notes: '  window seat ' })).toEqual({
			service_id: 'table',
			start: START,
			party: 4,
			customer: { name: 'Sam', phone: '555 0100' },
			notes: 'window seat'
		});
	});

	test.each([
		['no start', { ...request, start: undefined }, 'Pick a time'],
		['a start without an offset', { ...request, start: '2026-10-16T19:00:00' }, 'Pick a time'],
		['a bad service id', { ...request, service_id: '../x' }, 'Pick a time'],
		['party 0', { ...request, party: 0 }, 'how many'],
		['party 2.5', { ...request, party: 2.5 }, 'how many'],
		['no name', { ...request, customer: { email: 'sam@example.com' } }, 'name'],
		['an 81-character name', { ...request, customer: { name: 'x'.repeat(81), email: 'sam@example.com' } }, 'name'],
		['no contact', { ...request, customer: { name: 'Sam' } }, 'email or a phone'],
		['a junk email', { ...request, customer: { name: 'Sam', email: 'sam@' } }, 'email'],
		['a 25-character phone', { ...request, customer: { name: 'Sam', phone: '1'.repeat(25) } }, 'phone'],
		['long notes', { ...request, notes: 'x'.repeat(501) }, 'Notes'],
		['not an object', 'book me', 'could not be read']
	])('refuses %s', (_, v, message) => {
		const r = toBookingRequest(v);
		expect('error' in r && r.error).toContain(message);
	});
});

describe('book()', () => {
	test('201: posts the request to /api/bookings and returns the confirmed booking', async () => {
		const fetch = reply(201, confirmed);
		const r = await book(request, { storeUrl: `${STORE}/`, fetch });
		expect(r).toEqual({ ok: true, booking: { booking_id: 'BK-1A2B3C4D', start: START, label: '7:00 PM', date_label: 'Fri 16 Oct', service_name: 'Table reservation', party: 4 } });
		const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${STORE}/api/bookings`);
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body as string)).toEqual(request);
	});

	test('201 without a readable booking id is not a confirmation', async () => {
		const r = await book(request, { storeUrl: STORE, fetch: reply(201, { ...confirmed, booking_id: '<b>' }) });
		expect(r.ok).toBe(false);
	});

	test('409 slot_taken: a slot_taken notice carrying the start, new each time', async () => {
		const a = await book(request, { storeUrl: STORE, fetch: reply(409, { error: 'slot_taken' }) });
		const b = await book(request, { storeUrl: STORE, fetch: reply(409, { error: 'slot_taken' }) });
		expect(a).toEqual({ ok: false, notice: { kind: 'error', text: SLOT_TAKEN, code: 'slot_taken', start: START } });
		expect(!a.ok && !b.ok && a.notice).not.toBe(!b.ok && b.notice);
	});

	test('400: the store message, with a reload when it is about the time', async () => {
		const about = await book(request, { storeUrl: STORE, fetch: reply(400, { error: 'invalid_request', message: 'start is not an open slot for this service' }) });
		expect(about).toEqual({
			ok: false,
			notice: { kind: 'error', text: 'The restaurant could not take that booking: start is not an open slot for this service.' },
			reload: true
		});
		const other = await book(request, { storeUrl: STORE, fetch: reply(400, { error: 'invalid_request', message: 'customer.phone is not a valid phone number' }) });
		expect(other).toMatchObject({ ok: false, reload: false });
	});

	test.each([
		[429, { error: 'rate_limited' }, 'Wait a minute'],
		[503, {}, 'Try again shortly']
	])('%i: a calm notice', async (status, body, text) => {
		const r = await book(request, { storeUrl: STORE, fetch: reply(status, body) });
		expect(!r.ok && r.notice).toMatchObject({ kind: 'error', text: expect.stringContaining(text) });
		expect(!r.ok && r.notice.code).toBeUndefined();
	});

	test('a network error: a calm notice', async () => {
		const fetch = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		});
		const r = await book(request, { storeUrl: STORE, fetch });
		expect(!r.ok && r.notice.text).toContain("Can't reach the restaurant");
	});
});

describe('reloadDays, patchBooking, bookingIcs', () => {
	const days = [{ date: '2026-10-16', date_label: 'Fri 16 Oct', slots: [{ start: START, label: '7:00 PM', available: true }] }];

	test('reloadDays asks the store for each shown day; null when one fails', async () => {
		const fresh = { date: '2026-10-16', date_label: 'Fri 16 Oct', tz: 'America/New_York', slots: [{ start: START, label: '7:00 PM', available: false }] };
		const fetch = reply(200, fresh);
		expect(await reloadDays(days, 'table', 4, { storeUrl: STORE, fetch })).toEqual([{ date: '2026-10-16', date_label: 'Fri 16 Oct', slots: fresh.slots }]);
		expect(fetch.mock.calls[0][0]).toBe(`${STORE}/api/booking/slots?service=table&date=2026-10-16&party=4`);
		expect(await reloadDays(days, 'table', 4, { storeUrl: STORE, fetch: reply(400, { error: 'invalid_request' }) })).toBeNull();
	});

	test('patchBooking copies the spec and patches the booking node offering the service', () => {
		const spec = {
			version: '1.0',
			ui: {
				type: 'flex',
				children: [
					{ type: 'booking', props: { services: [{ id: 'haircut' }] } },
					{ type: 'booking', props: { services: [{ id: 'table' }], days } }
				]
			}
		};
		const next = patchBooking(spec, 'table', { notice: { kind: 'info', text: 'hi' } })!;
		expect(next).not.toBe(spec);
		expect(next.ui).toMatchObject({ children: [{ props: { services: [{ id: 'haircut' }] } }, { props: { notice: { kind: 'info', text: 'hi' }, days } }] });
		expect(JSON.stringify(spec)).not.toContain('notice');
		expect(patchBooking({ ui: { type: 'text' } }, 'table', {})).toBeNull();
		// No node offers it: the first booking node answers.
		expect(patchBooking(spec, 'nails', { x: 1 })!.ui).toMatchObject({ children: [{ props: { x: 1 } }, { props: { services: [{ id: 'table' }] } }] });
	});

	test('bookingIcs: UTC times, the service length, escaped text, CRLF', () => {
		const ics = bookingIcs(
			{ booking_id: 'BK-1', start: START, service_name: 'Table; window, please', party: 4 },
			{ durationMin: 90, place: 'Tasty Bites', now: Date.UTC(2026, 9, 9, 12) }
		);
		expect(ics.split('\r\n')).toEqual([
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Ripple//Booking//EN',
			'BEGIN:VEVENT',
			'UID:BK-1@ripple.pocketpaw.xyz',
			'DTSTAMP:20261009T120000Z',
			'DTSTART:20261016T230000Z',
			'DTEND:20261017T003000Z',
			'SUMMARY:Table\\; window\\, please\\, party of 4',
			'DESCRIPTION:Booking BK-1',
			'LOCATION:Tasty Bites',
			'END:VEVENT',
			'END:VCALENDAR',
			''
		]);
		expect(bookingIcs({ booking_id: 'BK-1', start: 'Friday' })).toBe('');
	});
});

// ── ChatSession wiring ─────────────────────────────────────────────────────

const bookingSpec = {
	ui: {
		type: 'booking',
		props: {
			subtitle: 'Tasty Bites',
			services: [{ id: 'table', name: 'Table reservation', kind: 'table', duration_min: 90, party: { min: 1, max: 8 } }],
			days: [{ date: '2026-10-16', date_label: 'Fri 16 Oct', slots: [{ start: START, label: '7:00 PM', available: true }] }]
		},
		on_book: { action: 'emit', target: 'book' }
	}
};
const menuSpec = { ui: { type: 'menu-order', props: { checkout: true, items: [] }, on_checkout: { action: 'emit', target: 'checkout' } } };
const cart = {
	lines: [{ product_id: 'burger-1', qty: 1, option_ids: ['size-large'], name: 'Classic Cheeseburger', unit_price: 13.49 }],
	fulfilment: 'pickup',
	customer: { name: 'Sam', email: 'sam@example.com', phone: '555 0100' },
	total: 13.49
};
const emit = (target: string, payload: unknown): RippleEvent => ({ type: 'emit', name: target, target, payload });
const oneCard = (card: unknown): Transport =>
	async function* () {
		yield { event: 'card.start', data: { card_id: 'c' } };
		yield { event: 'card.final', data: { card_id: 'c', card } };
	};
async function finalCard(card: unknown, store?: ConstructorParameters<typeof ChatSession>[2]) {
	const session = new ChatSession(oneCard(card), undefined, store);
	await session.send('x');
	const part = session.turns[1].parts[0];
	if (part?.kind !== 'card') throw new Error('no card');
	return { session, card: part.card };
}
const bookingNode = (card: Card) => (card.spec!.ui as { props: Record<string, unknown> }).props;

describe('ChatSession host events', () => {
	test('checkout from a final menu-order card posts the Cart and puts the pay link on the card, never navigating', async () => {
		const fetch = reply(200, { url: 'https://checkout.stripe.com/c/pay/cs_test_1', sessionId: 'cs_test_1' });
		const href = location.href;
		const { session, card } = await finalCard(menuSpec, { storeUrl: STORE, fetch, pageOrigin: 'https://ripple.example' });
		await session.hostEvent(card, emit('checkout', cart));
		const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${STORE}/api/checkout`);
		expect(JSON.parse(init.body as string).items).toEqual([{ item: { id: 'burger-1' }, quantity: 1, options: ['size-large'] }]);
		expect(card.pay).toEqual({
			url: 'https://checkout.stripe.com/c/pay/cs_test_1',
			sessionId: 'cs_test_1',
			summary: { lines: [{ name: 'Classic Cheeseburger', qty: 1, price: 13.49 }], orderType: 'pickup', total: 13.49 }
		});
		expect(card.note).toBeNull();
		expect(card.sent).toBeNull();
		expect(location.href).toBe(href);
	});

	test('while the order is pending or paid, a second checkout opens no session and nudges the pay card', async () => {
		sessionStorage.clear();
		const fetch = vi.fn(async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_1', sessionId: 'cs_1' })));
		const { session, card } = await finalCard(menuSpec, { storeUrl: STORE, fetch, pageOrigin: 'https://ripple.example' });
		await session.hostEvent(card, emit('checkout', cart));
		expect(JSON.parse(sessionStorage.getItem(ORDER_KEY)!)).toMatchObject({ sessionId: 'cs_1', status: 'pending' });
		await session.hostEvent(card, emit('checkout', cart));
		expect(fetch).toHaveBeenCalledOnce();
		expect(card.payNudge).toBe(1);
		session.notePhase(card, card.pay!, 'tracking');
		expect(JSON.parse(sessionStorage.getItem(ORDER_KEY)!).status).toBe('paid');
		await session.hostEvent(card, emit('checkout', cart));
		expect(fetch).toHaveBeenCalledOnce();
		expect(card.payNudge).toBe(2);
		expect(card.pay?.sessionId).toBe('cs_1');
		session.notePhase(card, card.pay!, 'cancelled');
		expect(sessionStorage.getItem(ORDER_KEY)).toBeNull();
		await session.hostEvent(card, emit('checkout', cart));
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	test('a pay link off the allowlist never reaches the card', async () => {
		const fetch = reply(200, { url: 'https://evil.example/pay', sessionId: 'cs_test_1' });
		const { session, card } = await finalCard(menuSpec, { storeUrl: STORE, fetch, pageOrigin: 'https://ripple.example' });
		await session.hostEvent(card, emit('checkout', cart));
		expect(card.pay).toBeNull();
		expect(card.note?.kind).toBe('error');
	});

	test('retryCheckout runs the same Cart through a new checkout', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_1', sessionId: 'cs_1' })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_2', sessionId: 'cs_2' })));
		const { session, card } = await finalCard(menuSpec, { storeUrl: STORE, fetch, pageOrigin: 'https://ripple.example' });
		await session.hostEvent(card, emit('checkout', cart));
		session.notePhase(card, card.pay!, 'cancelled');
		await session.retryCheckout(card);
		expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);
		expect(card.pay?.sessionId).toBe('cs_2');
	});

	test('a checkout the store refuses, or the host re-check stops, shows on the card with no pay link', async () => {
		const { session, card } = await finalCard(menuSpec, { storeUrl: STORE, fetch: reply(400, { message: 'Choose a size' }) });
		await session.hostEvent(card, emit('checkout', cart));
		expect(card.note).toEqual({ kind: 'error', text: 'The store rejected the order: Choose a size' });
		await session.hostEvent(card, emit('checkout', { ...cart, lines: [{ ...cart.lines[0], qty: 21 }] }));
		expect(card.note?.text).toContain('Up to 20');
		expect(card.pay).toBeNull();
	});

	test('one checkout or booking in flight at a time', async () => {
		let release!: (r: Response) => void;
		const fetch = vi.fn(() => new Promise<Response>((r) => (release = r)));
		const { session, card } = await finalCard(menuSpec, { storeUrl: STORE, fetch, pageOrigin: 'https://ripple.example' });
		const first = session.hostEvent(card, emit('checkout', cart));
		await session.hostEvent(card, emit('checkout', cart));
		expect(card.note?.text).toContain('still on its way');
		expect(fetch).toHaveBeenCalledOnce();
		release(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_1', sessionId: 'cs_1' }), { status: 200 }));
		await first;
		expect(card.pay?.sessionId).toBe('cs_1');
	});

	test('host events stay inert while the card streams, and without a StoreHost', async () => {
		const fetch = vi.fn();
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const session = new ChatSession(
			async function* () {
				yield { event: 'card.start', data: { card_id: 'c' } };
				yield { event: 'card.delta', data: { card_id: 'c', text: '{"ui":{"type":"booking"' } };
				await gate;
				yield { event: 'card.final', data: { card_id: 'c', card: bookingSpec } };
			},
			undefined,
			{ storeUrl: STORE, fetch }
		);
		const sent = session.send('x');
		await vi.waitFor(() => expect(session.turns[1]?.parts[0]).toBeDefined());
		const part = session.turns[1].parts[0];
		if (part.kind !== 'card') throw new Error('no card');
		expect(session.hostEvent(part.card, emit('book', request))).toBeUndefined();
		release();
		await sent;
		const plain = await finalCard(bookingSpec);
		expect(plain.session.hostEvent(plain.card, emit('book', request))).toBeUndefined();
		expect(plain.card.sent).toBe('emit: book');
		expect(fetch).not.toHaveBeenCalled();
	});

	test('book 201: confirmed goes into the booking props and a receipt under the card', async () => {
		const { session, card } = await finalCard(bookingSpec, { storeUrl: STORE, fetch: reply(201, confirmed) });
		const before = card.spec;
		await session.hostEvent(card, emit('book', request));
		expect(card.spec).not.toBe(before);
		expect(bookingNode(card).confirmed).toMatchObject({ booking_id: 'BK-1A2B3C4D', label: '7:00 PM', date_label: 'Fri 16 Oct' });
		expect(card.receipt).toEqual({
			booking: expect.objectContaining({ booking_id: 'BK-1A2B3C4D', start: START, party: 4 }),
			durationMin: 90,
			place: 'Tasty Bites'
		});
	});

	test('book 409: a new slot_taken notice each answer, no receipt', async () => {
		const { session, card } = await finalCard(bookingSpec, { storeUrl: STORE, fetch: reply(409, { error: 'slot_taken' }) });
		await session.hostEvent(card, emit('book', request));
		const first = bookingNode(card).notice;
		expect(first).toEqual({ kind: 'error', text: SLOT_TAKEN, code: 'slot_taken', start: START });
		await session.hostEvent(card, emit('book', request));
		expect(bookingNode(card).notice).toEqual(first);
		expect(bookingNode(card).notice).not.toBe(first);
		expect(card.receipt).toBeNull();
	});

	test('book 400 about the time: the store message and fresh days from the store', async () => {
		const fresh = { date: '2026-10-16', date_label: 'Fri 16 Oct', slots: [{ start: START, label: '7:00 PM', available: false }] };
		const fetch = vi.fn(async (url: unknown) =>
			String(url).endsWith('/api/bookings')
				? new Response(JSON.stringify({ error: 'invalid_request', message: 'start is not an open slot for this service' }), { status: 400 })
				: new Response(JSON.stringify(fresh), { status: 200 })
		);
		const { session, card } = await finalCard(bookingSpec, { storeUrl: STORE, fetch });
		await session.hostEvent(card, emit('book', request));
		expect(bookingNode(card).notice).toEqual({ kind: 'error', text: expect.stringContaining('start is not an open slot') });
		expect(bookingNode(card).days).toEqual([fresh]);
	});

	test('book 429 and an invalid request: notices, no store call for the invalid one', async () => {
		const fetch = reply(429, { error: 'rate_limited' });
		const { session, card } = await finalCard(bookingSpec, { storeUrl: STORE, fetch });
		await session.hostEvent(card, emit('book', request));
		expect(bookingNode(card).notice).toMatchObject({ kind: 'error', text: expect.stringContaining('Wait a minute') });
		await session.hostEvent(card, emit('book', { ...request, customer: { name: 'Sam' } }));
		expect(bookingNode(card).notice).toEqual({ kind: 'error', text: 'Add an email or a phone number.' });
		expect(fetch).toHaveBeenCalledOnce();
	});
});

// ── A booking the store does not back: the slot goes to the chat ───────────

const TUE = '2026-10-14T10:30:00-04:00';
const cleaning = { id: 'cleaning', name: 'Teeth cleaning', kind: 'health', duration_min: 30 };
const dentistProps = (service: Record<string, unknown> = cleaning) => ({
	subtitle: 'Bright Smile Dental',
	services: [service],
	days: [{ date: '2026-10-14', date_label: 'Tue 14 Oct', slots: [{ start: TUE, label: '10:30', available: true }] }]
});
const dentistSpec = (service?: Record<string, unknown>) => ({ ui: { type: 'booking', props: dentistProps(service) } });
const slot = { service_id: 'cleaning', start: TUE, customer: { name: 'Sam', email: 'sam@example.com' } };

/** A session whose transport answers every message with `card` and records what was sent. */
async function chatCard(card: unknown, store?: ConstructorParameters<typeof ChatSession>[2]) {
	const said: string[] = [];
	const session = new ChatSession(
		async function* (message) {
			said.push(message);
			yield { event: 'card.start', data: { card_id: 'c' } };
			yield { event: 'card.final', data: { card_id: 'c', card } };
		},
		undefined,
		store
	);
	await session.send('Book a dentist appointment');
	const part = session.turns[1].parts[0];
	if (part?.kind !== 'card') throw new Error('no card');
	return { session, card: part.card, said };
}
const visitorTexts = (session: ChatSession) =>
	session.turns.filter((t) => t.role === 'user').map((t) => (t.parts[0]?.kind === 'text' ? t.parts[0].text : ''));
const settle = async (session: ChatSession) => {
	await new Promise((r) => setTimeout(r));
	await vi.waitFor(() => expect(session.busy).toBe(false));
};

describe('a booking with no store wiring sends the chosen slot to the chat', () => {
	test('the host wires only the unwired booking, to its own event', async () => {
		const { card } = await chatCard(dentistSpec());
		expect((card.spec!.ui as Record<string, unknown>).on_book).toEqual({ action: 'emit', target: BOOK_CHAT });
		const table = await chatCard(bookingSpec);
		expect((table.card.spec!.ui as Record<string, unknown>).on_book).toEqual({ action: 'emit', target: 'book' });
	});

	test('confirming a dentist slot sends exactly one visitor message and never books at the store', async () => {
		const fetch = vi.fn();
		const { session, card, said } = await chatCard(dentistSpec(), { storeUrl: STORE, fetch });
		await session.hostEvent(card, emit(BOOK_CHAT, slot));
		await settle(session);
		const text = "I'd like to book Teeth cleaning on Tue 14 Oct at 10:30.";
		expect(said).toEqual(['Book a dentist appointment', text]);
		expect(visitorTexts(session)).toEqual(['Book a dentist appointment', text]);
		expect(fetch).not.toHaveBeenCalled();
		expect(card.receipt).toBeNull();
		expect(bookingNode(card).sent).toEqual({ text });
		expect(bookingNode(card).confirmed).toBeUndefined();
	});

	test('end to end: the widget fires the wired event and the card says Sent to chat, not booked', async () => {
		const { session, card, said } = await chatCard(dentistSpec());
		const view = render(Ripple, { props: { spec: card.spec, onEvent: (e: RippleEvent) => session.hostEvent(card, e) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Choose a time' }));
		await fireEvent.click(screen.getByRole('button', { name: /^10:30/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add your details' }));
		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
		await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Review' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));
		await settle(session);
		expect(said.slice(1)).toEqual(["I'd like to book Teeth cleaning on Tue 14 Oct at 10:30."]);
		await view.rerender({ spec: card.spec });
		expect(screen.getByText('Sent to chat')).toBeTruthy();
		expect(screen.queryByText("You're booked")).toBeNull();
		expect(screen.queryByRole('button', { name: 'Confirm booking' })).toBeNull();
		view.unmount();
	});

	test('party only when the service takes one, and the visitor note, trimmed', () => {
		const spec = dentistSpec({ ...cleaning, party: { min: 1, max: 4 } });
		expect(slotMessage(spec, { ...slot, party: 1, notes: '  first visit  ' })).toBe(
			"I'd like to book Teeth cleaning on Tue 14 Oct at 10:30 (1 person). Note: first visit"
		);
		expect(slotMessage(spec, { ...slot, party: 3 })).toBe("I'd like to book Teeth cleaning on Tue 14 Oct at 10:30 (3 people).");
		expect(slotMessage(dentistSpec(), { ...slot, party: 3 })).toBe("I'd like to book Teeth cleaning on Tue 14 Oct at 10:30.");
	});

	test('plain text and capped, even when the model wrote braces or markup into the labels', () => {
		const spec = dentistSpec({ ...cleaning, name: '{state.secret} <b>Deep</b> clean' });
		const text = slotMessage(spec, { ...slot, notes: `<img src=x> {ask} ${'x'.repeat(400)}` });
		expect(text).not.toMatch(/[{}<>]/);
		expect(text.length).toBeLessThanOrEqual(SLOT_MESSAGE_MAX);
		expect(text.startsWith("I'd like to book state.secret b Deep /b clean on Tue 14 Oct at 10:30.")).toBe(true);
	});

	test('only the card\'s own service and open slot make a message; a forged emit makes a refused card', () => {
		expect(slotMessage(dentistSpec(), { ...slot, service_id: 'whitening' })).toBe('');
		expect(slotMessage(dentistSpec(), { ...slot, start: '2026-10-14T11:00:00-04:00' })).toBe('');
		expect(slotMessage(dentistSpec(), 'book me')).toBe('');
		const forged = { ui: { type: 'button', props: { label: 'Go' }, on_click: { action: 'emit', target: BOOK_CHAT, value: slot } } };
		expect(refuseCard(forged)).toBeTruthy();
	});

	test('a second confirm sends nothing more', async () => {
		const { session, card, said } = await chatCard(dentistSpec());
		await session.hostEvent(card, emit(BOOK_CHAT, slot));
		await session.hostEvent(card, emit(BOOK_CHAT, slot));
		await settle(session);
		await session.hostEvent(card, emit(BOOK_CHAT, { ...slot, notes: 'again' }));
		await settle(session);
		expect(said).toHaveLength(2);
		expect(visitorTexts(session)).toHaveLength(2);
	});

	test('a store-backed table booking keeps the store flow and sends no chat message', async () => {
		const fetch = reply(201, confirmed);
		const { session, card, said } = await chatCard(bookingSpec, { storeUrl: STORE, fetch });
		await session.hostEvent(card, emit('book', request));
		await settle(session);
		expect(fetch).toHaveBeenCalledOnce();
		expect(bookingNode(card).confirmed).toMatchObject({ booking_id: 'BK-1A2B3C4D' });
		expect(bookingNode(card).sent).toBeUndefined();
		expect(said).toEqual(['Book a dentist appointment']);
		expect(visitorTexts(session)).toHaveLength(1);
	});
});
