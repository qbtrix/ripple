// @file ui/__fixtures__/contrast.ts
// @description NEW 2026-09-17 (fix/port-gaps). Test-only colour math for the
//   status-text contrast guard: oklch to sRGB, alpha compositing in sRGB (what
//   browsers do for `bg-x/10`), `color-mix(in oklab, …)`, and WCAG contrast.
//   It lives under __fixtures__ so it stays out of the published files. The
//   same math matched Chromium's computed contrast to two decimals in the
//   CodeBlock and error-red measurements.

export type Lab = [number, number, number];
export type Rgb = [number, number, number];

export const oklch = (l: number, c: number, h: number): Lab => [
  l,
  c * Math.cos((h * Math.PI) / 180),
  c * Math.sin((h * Math.PI) / 180),
];

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Gamma-encoded sRGB (0..1), gamut-clamped. */
export function toRgb([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => encode(clamp(v))) as Rgb;
}

/** `color-mix(in oklab, a p, b)`. */
export const mix = (a: Lab, b: Lab, p: number): Lab =>
  [0, 1, 2].map((i) => a[i] * p + b[i] * (1 - p)) as Lab;

/** `top` at `alpha` composited over an opaque `bottom`, in sRGB. */
export const over = (top: Rgb, alpha: number, bottom: Rgb): Rgb =>
  [0, 1, 2].map((i) => top[i] * alpha + bottom[i] * (1 - alpha)) as Rgb;

export function contrast(x: Rgb, y: Rgb): number {
  const lum = (c: Rgb) => 0.2126 * decode(c[0]) + 0.7152 * decode(c[1]) + 0.0722 * decode(c[2]);
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** A `#rrggbb` colour as oklab, so hex host tokens join the mix math. */
export function fromHex(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map((i) => decode(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
