import { test, expect } from 'vitest';
import { nameHue, nameTint } from './tint.js';

test('a name always maps to the same hue, outside the accent blue band', () => {
	for (const n of ['Mara Lindqvist', 'Tomas Reyes', 'Aiko', 'x', 'Sam Ito', 'Priya Raman']) {
		expect(nameHue(n)).toBe(nameHue(n));
		const h = nameHue(n);
		expect(h >= 225 && h < 285).toBe(false);
	}
	expect(nameTint('Mara')).toBe(nameTint('  mara '));
});

test('the tint survives safeStyle (avatars and letter tiles render it through the guard)', async () => {
	const { safeStyle } = await import('@ripple-ui/core');
	const out = safeStyle(nameTint('Mara'));
	expect(out).toContain('background-color:color-mix(');
	expect(out).toContain('color:color-mix(');
});
