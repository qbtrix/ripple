// routes/live/brands.ts — The host's brand for a recorded run: the fictional
// business whose site or app the run lives in. The recording never changes;
// the host page passes the pack to <Ripple brand> (and the /live Player paints
// its render pane with it), which is how a real business would skin the same
// model output. Only the For business runs have one; every other run keeps
// Ripple's default look.
//
// Each brand is a whole, fixed palette (ground, surfaces, ink, lines, accent),
// a radius and a typeface. Fixed on purpose: a shop's widget looks like the
// shop's site whatever the visitor's OS theme is. Typefaces are system stacks,
// so a brand adds no third-party request; each stack ends in a generic family
// that keeps its character. A
// brand sets no monospace: its typeface also fills the mono slot.

import type { BrandPack } from '@ripple-ui/core';

interface Palette {
	ground: string;
	surface: string;
	ink: string;
	muted: string;
	mutedInk: string;
	line: string;
	accent: string;
	onAccent: string;
}

function pack(id: string, name: string, p: Palette, radius: string, sans: string): BrandPack {
	const c = (light: string) => ({ light });
	return {
		id,
		name,
		version: '1.0.0',
		tokens: {
			color: {
				background: c(p.ground),
				foreground: c(p.ink),
				surface: c(p.surface),
				surfaceForeground: c(p.ink),
				muted: c(p.muted),
				mutedForeground: c(p.mutedInk),
				secondary: c(p.muted),
				secondaryForeground: c(p.ink),
				accent: c(p.muted),
				accentForeground: c(p.ink),
				border: c(p.line),
				primary: c(p.accent),
				primaryForeground: c(p.onAccent),
				ring: c(p.accent)
			},
			radius: { base: radius },
			// mono too: stats and tool names use it, and a shop's numbers wear its own face.
			typography: { fontFamily: { sans, mono: sans } }
		}
	};
}

/** Scenario id -> the brand its host applies. */
export const BRANDS: Record<string, BrandPack> = {
	// A support desk: harbour grey and deep teal, medium corners, a humanist sans.
	'refund-approval': pack(
		'harbor-desk',
		'Harbor Desk',
		{
			ground: 'oklch(0.955 0.01 220)',
			surface: 'oklch(0.99 0.004 220)',
			ink: 'oklch(0.24 0.03 230)',
			muted: 'oklch(0.92 0.015 220)',
			mutedInk: 'oklch(0.48 0.03 225)',
			line: 'oklch(0.86 0.02 220)',
			accent: 'oklch(0.48 0.09 200)',
			onAccent: 'oklch(0.99 0.005 200)'
		},
		'8px',
		"Optima, Candara, 'Segoe UI', 'Helvetica Neue', sans-serif"
	),
	// An outdoor-gear shop: stone and pine, square-ish corners, a humanist sans.
	'return-exchange': pack(
		'fernhill',
		'Fernhill Outfitters',
		{
			ground: 'oklch(0.93 0.012 130)',
			surface: 'oklch(0.975 0.008 120)',
			ink: 'oklch(0.25 0.035 155)',
			muted: 'oklch(0.9 0.02 135)',
			mutedInk: 'oklch(0.47 0.03 150)',
			line: 'oklch(0.83 0.025 135)',
			accent: 'oklch(0.44 0.085 158)',
			onAccent: 'oklch(0.98 0.01 120)'
		},
		'3px',
		"'Gill Sans', 'Gill Sans MT', Corbel, 'Trebuchet MS', sans-serif"
	),
	// A barbershop: espresso and brass, hard corners, an old-style serif.
	'book-appointment': pack(
		'juniper-pine',
		'Juniper & Pine',
		{
			ground: 'oklch(0.2 0.018 55)',
			surface: 'oklch(0.25 0.022 55)',
			ink: 'oklch(0.93 0.025 85)',
			muted: 'oklch(0.31 0.025 55)',
			mutedInk: 'oklch(0.74 0.04 75)',
			line: 'oklch(0.37 0.03 60)',
			accent: 'oklch(0.77 0.11 78)',
			onAccent: 'oklch(0.2 0.03 55)'
		},
		'1px',
		"'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif"
	),
	// An invoicing app: cool paper, ink violet, soft corners, a geometric sans.
	'quote-builder': pack(
		'ledgerline',
		'Ledgerline',
		{
			ground: 'oklch(0.965 0.012 285)',
			surface: 'oklch(0.995 0.004 285)',
			ink: 'oklch(0.23 0.045 285)',
			muted: 'oklch(0.93 0.02 285)',
			mutedInk: 'oklch(0.5 0.04 285)',
			line: 'oklch(0.88 0.025 285)',
			accent: 'oklch(0.5 0.21 285)',
			onAccent: 'oklch(0.99 0.005 285)'
		},
		'12px',
		"'Avenir Next', Avenir, 'Segoe UI', Candara, sans-serif"
	),
	// An ops console: night navy, signal amber, tight corners, a plain UI sans.
	'incident-rollback': pack(
		'ops-console',
		'Ops console',
		{
			ground: 'oklch(0.17 0.025 255)',
			surface: 'oklch(0.215 0.03 255)',
			ink: 'oklch(0.93 0.012 250)',
			muted: 'oklch(0.27 0.03 255)',
			mutedInk: 'oklch(0.7 0.025 250)',
			line: 'oklch(0.32 0.035 255)',
			accent: 'oklch(0.8 0.15 78)',
			onAccent: 'oklch(0.2 0.03 70)'
		},
		'5px',
		"'Segoe UI Variable', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif"
	)
};
