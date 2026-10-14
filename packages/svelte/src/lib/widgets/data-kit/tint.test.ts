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
