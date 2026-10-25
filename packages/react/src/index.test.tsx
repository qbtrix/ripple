// src/index.test.tsx: <Ripple> drives the embed's handle the way it says it
// does. The embed is mocked: its own behaviour is tested in packages/embed.
import { act, cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const calls: string[] = [];
const handle = {
	ready: Promise.resolve(),
	update: vi.fn((s: unknown) => void calls.push(`update ${JSON.stringify(s)}`)),
	setTheme: vi.fn((t: string) => void calls.push(`theme ${t}`)),
	finish: vi.fn(() => void calls.push('finish')),
	destroy: vi.fn(() => void calls.push('destroy'))
};
const mount = vi.fn((_el: HTMLElement, spec: unknown, opts: { theme?: string; streaming?: boolean }) => {
	calls.push(`mount ${JSON.stringify(spec)} ${opts.theme} ${opts.streaming}`);
	return handle;
});
vi.mock('@ripple-ui/embed', () => ({ mount }));

const { Ripple } = await import('./index.js');
const flush = () =>
	act(async () => {
		await new Promise((r) => setTimeout(r, 50));
	});

beforeEach(() => void (calls.length = 0));
afterEach(cleanup);

it('mounts once into its div, updates on new props, destroys on unmount', async () => {
	const view = render(<Ripple spec={{ a: 1 }} theme="dark" />);
	await flush();
	expect(mount).toHaveBeenCalledWith(view.container.querySelector('div[data-ripple]'), { a: 1 }, expect.objectContaining({ theme: 'dark' }));

	view.rerender(<Ripple spec={{ a: 2 }} theme="light" />);
	await flush();
	view.unmount();
	expect(calls).toEqual(['mount {"a":1} dark false', 'update {"a":2}', 'theme light', 'destroy']);
});

it('survives StrictMode double effects with exactly one live mount', async () => {
	const view = render(
		<StrictMode>
			<Ripple spec={{ s: 1 }} />
		</StrictMode>
	);
	await flush();
	expect(calls.filter((c) => c.startsWith('mount')).length).toBe(1);
	view.unmount();
	expect(calls.at(-1)).toBe('destroy');
});

it('passes events through the latest onEvent and finishes a stream', async () => {
	const seen: string[] = [];
	const view = render(<Ripple spec='{"version":"1.0"' streaming onEvent={() => void seen.push('first')} />);
	await flush();
	view.rerender(<Ripple spec='{"version":"1.0"}' streaming={false} onEvent={() => void seen.push('second')} />);
	await flush();
	const opts = mount.mock.calls.at(-1)![2] as { onEvent: (e: unknown) => void };
	opts.onEvent({ type: 'emit' });
	expect(seen).toEqual(['second']);
	expect(calls).toContain('finish');
	view.unmount();
});
