// @file ui/status-text.test.ts
// @description NEW 2026-09-17 (fix/port-gaps). Status colours painted as text
//   failed WCAG AA in light mode: `text-ripple-error` on its own `/10` tint
//   measured 2.89:1, success 2.07:1, warning lower still. The tones are fill
//   colours; used as text on a light ground they are too pale.
//
//   Three guards:
//   1. theme.css publishes `--ripple-{tone}-text` for every status tone as a
//      blend of the tone toward the surface ink, and each reaches 4.5:1 on the
//      plain ground and on the tone's own /10 and /15 tints, under
//      paw-enterprise's light and dark tokens. The dark check runs twice for
//      error: with the alias to `--destructive`, and with paw-enterprise's
//      `.ripple-root` override to `--paw-error`.
//   2. No packaged component paints text with a raw tone
//      (`text-ripple-error`, `text-destructive`, …); it uses the `-text` token.
//   3. TaskRows' solid done/failed badges keep their white icon at 3:1, the
//      non-text threshold, against the fill.
//   4. UPDATED 2026-09-17: the destructive Button and ErrorState's action
//      button put a white label on solid red, 3.59:1 light and 2.89:1 dark.
//      Each darkens its fill toward black in its own scoped CSS (the host's
//      --destructive is left alone), at rest and on hover, and the label must
//      reach 4.5:1 in every state while hover stays distinct from rest.
import { test, expect } from 'vitest';
import { oklch, toRgb, mix, over, contrast, type Lab } from './__fixtures__/contrast.js';

const TONES = ['error', 'success', 'warning', 'info'] as const;
type Tone = (typeof TONES)[number];

// paw-enterprise src/styles/global.css. The ground is its --background, opaque.
type Host = { fg: Lab; ground: Lab } & Record<Tone, Lab>;
const common = {
  success: oklch(0.72, 0.17, 155),
  warning: oklch(0.8, 0.16, 80),
  info: oklch(0.7, 0.12, 250),
};
const HOSTS: Record<string, Host> = {
  light: { ...common, fg: oklch(0.15, 0.015, 260), ground: oklch(0.97, 0.005, 260), error: oklch(0.65, 0.22, 25) },
  'dark, --destructive': { ...common, fg: oklch(0.95, 0.005, 260), ground: oklch(0.13, 0.015, 260), error: oklch(0.704, 0.191, 22.216) },
  'dark, --paw-error': { ...common, fg: oklch(0.95, 0.005, 260), ground: oklch(0.13, 0.015, 260), error: oklch(0.65, 0.22, 25) },
};

async function read(path: string): Promise<string> {
  // vitest empties .css imports, `?raw` included. ripple's tsconfig has no node types.
  // @ts-ignore
  const { readFileSync } = await import('node:fs');
  return readFileSync(path, 'utf8');
}

test('every status tone has a text token that reaches 4.5:1 on its tint and the plain ground', async () => {
  const css = await read('src/lib/theme.css');
  const failures: string[] = [];
  for (const tone of TONES) {
    const decl = css.match(
      new RegExp(`--ripple-${tone}-text:\\s*color-mix\\(in oklab,\\s*var\\(--ripple-${tone}\\)\\s+([\\d.]+)%,\\s*var\\(--ripple-surface-foreground\\)\\)`)
    );
    // Without a token the text is the raw tone, so measure that: the failure
    // output then shows what shipped.
    if (!decl) failures.push(`--ripple-${tone}-text is not declared as a blend toward the surface ink`);
    else if (!css.includes(`--color-ripple-${tone}-text: var(--ripple-${tone}-text);`)) {
      failures.push(`--color-ripple-${tone}-text utility missing`);
    }
    const p = decl ? Number(decl[1]) / 100 : 1;
    for (const [name, h] of Object.entries(HOSTS)) {
      const ground = toRgb(h.ground);
      const text = toRgb(mix(h[tone], h.fg, p));
      const base = toRgb(h[tone]);
      for (const [where, bg] of [
        ['plain', ground],
        ['/10 tint', over(base, 0.1, ground)],
        ['/15 tint', over(base, 0.15, ground)],
      ] as const) {
        const ratio = contrast(text, bg);
        if (ratio < 4.5) failures.push(`${tone} ${name} ${where}: ${ratio.toFixed(2)}`);
      }
    }
  }
  expect(failures).toEqual([]);
});

const ALL_SVELTE = import.meta.glob('../**/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

test('no packaged component paints text with a raw status tone', () => {
  expect(Object.keys(ALL_SVELTE).length).toBeGreaterThan(300);
  const raw = /\btext-(?:ripple-(?:error|success|warning|info)|destructive)(?![\w-])/g;
  const offenders: string[] = [];
  for (const [rel, src] of Object.entries(ALL_SVELTE)) {
    const code = src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(raw)) offenders.push(`${rel} ${m[0]}`);
  }
  expect(offenders).toEqual([]);
});

test("TaskRows' solid badges keep a white icon at 3:1 against the fill", async () => {
  const src = await read('src/lib/widgets/ai/TaskRows.svelte');
  const white = toRgb(oklch(1, 0, 0));
  const failures: string[] = [];
  for (const tone of ['success', 'error'] as const) {
    // A scoped fill rule that darkens the tone, if TaskRows has one; else the raw tone.
    const rule = src.match(
      new RegExp(`background(?:-color)?:\\s*color-mix\\(in oklab,\\s*var\\(--ripple-${tone}\\)\\s+([\\d.]+)%,\\s*black\\)`)
    );
    const p = rule ? Number(rule[1]) / 100 : 1;
    for (const [name, h] of Object.entries(HOSTS)) {
      const fill = toRgb(mix(h[tone], oklch(0, 0, 0), p));
      const ratio = contrast(white, fill);
      if (ratio < 3) failures.push(`${tone} badge ${name}: ${ratio.toFixed(2)}`);
    }
  }
  expect(failures).toEqual([]);
});

test('solid destructive buttons keep a white label at 4.5:1 at rest and on hover', async () => {
  // paw-enterprise --destructive, light and dark; --destructive-foreground is white in both.
  const RED: Record<string, Lab> = {
    light: oklch(0.65, 0.22, 25),
    dark: oklch(0.704, 0.191, 22.216),
  };
  const white = toRgb(oklch(1, 0, 0));
  const failures: string[] = [];
  for (const file of ['src/lib/widgets/input/Button.svelte', 'src/lib/widgets/overlay/ErrorState.svelte']) {
    const src = await read(file);
    const rules = [
      ...src.matchAll(
        /([^{}]*)\{\s*background-color:\s*color-mix\(in oklab,\s*var\(--destructive\)\s+([\d.]+)%,\s*black\);?\s*\}/g
      ),
    ].map((m) => ({ selector: m[1].trim(), p: Number(m[2]) / 100 }));
    const rest = rules.find((r) => !/:hover|:active/.test(r.selector));
    const hover = rules.find((r) => /:hover/.test(r.selector));
    if (!rest) failures.push(`${file}: no darkened rest fill`);
    if (!hover) failures.push(`${file}: no darkened hover fill`);
    if (rest && hover && rest.p === hover.p) failures.push(`${file}: hover fill equals rest`);
    const states = rules.length ? rules : [{ selector: 'raw --destructive', p: 1 }];
    for (const { selector, p } of states) {
      for (const [theme, red] of Object.entries(RED)) {
        const ratio = contrast(white, toRgb(mix(red, oklch(0, 0, 0), p)));
        if (ratio < 4.5) failures.push(`${file} ${selector} ${theme}: ${ratio.toFixed(2)}`);
      }
    }
  }
  expect(failures).toEqual([]);
});

// Control tokens: ink washes over the card. Boundaries (checkbox and radio
// rims, slider thumb, selected segment, OTP slots) need 3:1 against the card
// (WCAG 1.4.11); tracks, rails and skeleton blocks need a quiet 1.4:1. Measured
// on the ripple site's warm cards and on paw-enterprise's grounds.
test('control border reaches 3:1 and track reaches 1.4:1 on the card in both themes', async () => {
  const css = await read('src/lib/theme.css');
  const pct = (name: string) => {
    const m = css.match(
      new RegExp(`--ripple-${name}:\\s*color-mix\\(in oklab,\\s*var\\(--ripple-surface-foreground\\)\\s+([\\d.]+)%,\\s*transparent\\)`)
    );
    return m ? Number(m[1]) / 100 : 0;
  };
  const failures: string[] = [];
  for (const name of ['track', 'control-border']) {
    if (!css.includes(`--color-ripple-${name}: var(--ripple-${name});`)) failures.push(`--color-ripple-${name} utility missing`);
  }
  const cards: Record<string, { fg: Lab; ground: Lab }> = {
    'site light #efeee8': { fg: oklch(0.2, 0.01, 95), ground: oklch(0.9482, 0.0081, 98.9) },
    'site dark #1d1d1a': { fg: oklch(0.95, 0.005, 260), ground: oklch(0.2296, 0.0057, 106.8) },
    'pe light': { fg: HOSTS.light.fg, ground: HOSTS.light.ground },
    'pe dark': { fg: HOSTS['dark, --destructive'].fg, ground: HOSTS['dark, --destructive'].ground },
  };
  for (const [token, min] of [['control-border', 3], ['track', 1.4]] as const) {
    const p = pct(token);
    for (const [name, c] of Object.entries(cards)) {
      const ground = toRgb(c.ground);
      const ratio = contrast(over(toRgb(c.fg), p, ground), ground);
      if (ratio < min) failures.push(`${token} on ${name}: ${ratio.toFixed(2)} < ${min}`);
    }
  }
  expect(failures).toEqual([]);
});

test('checkbox and radio rims use the control border, not the host --input', async () => {
  const files = ['src/lib/components/ui/checkbox/checkbox.svelte', 'src/lib/components/ui/radio-group/radio-group-item.svelte'];
  for (const f of files) {
    const src = await read(f);
    expect(src, f).toContain('border-ripple-control-border');
    expect(src, f).not.toMatch(/"border-input /);
  }
});

// Treemap tiles: the accent mixed into the card on treemap.ts's RAMP, plus
// LIFT on hover. Tile ink is the surface ink; the value line is that ink at
// INK_ALPHA. Both must reach 4.5:1 on every step at rest and on hover, on the
// site's cards and on paw-enterprise's grounds. Brand blue #1877f2 in oklab.
test('treemap label ink reaches 4.5:1 on every ramp step, at rest and on hover', async () => {
  const { RAMP, LIFT, INK_ALPHA } = await import('../widgets/data/treemap.js');
  const css = await read('src/routes/site.css');
  expect(css).toMatch(/--primary:\s*#1877f2/i);
  const blue: Lab = [0.58913, -0.04266, -0.19833];
  const hexLab = (hex: string): Lab => {
    const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = [1, 3, 5].map((i) => dec(parseInt(hex.slice(i, i + 2), 16) / 255));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const cards: Record<string, { fg: Lab; ground: Lab }> = {
    'site light #efeee8': { fg: oklch(0.2, 0.01, 95), ground: hexLab('#efeee8') },
    'site dark #1d1d1a': { fg: oklch(0.95, 0.005, 260), ground: hexLab('#1d1d1a') },
    'pe light': { fg: HOSTS.light.fg, ground: HOSTS.light.ground },
    'pe dark': { fg: HOSTS['dark, --destructive'].fg, ground: HOSTS['dark, --destructive'].ground },
  };
  const failures: string[] = [];
  for (const step of RAMP) {
    for (const p of [step, step + LIFT]) {
      for (const [name, c] of Object.entries(cards)) {
        const tile = toRgb(mix(blue, c.ground, p / 100));
        const ink = contrast(toRgb(c.fg), tile);
        const meta = contrast(over(toRgb(c.fg), INK_ALPHA / 100, tile), tile);
        if (ink < 4.5) failures.push(`ink at ${p}% on ${name}: ${ink.toFixed(2)}`);
        if (meta < 4.5) failures.push(`value line at ${p}% on ${name}: ${meta.toFixed(2)}`);
      }
    }
  }
  expect(failures).toEqual([]);
});
