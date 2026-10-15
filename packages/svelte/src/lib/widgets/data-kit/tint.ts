// tint.ts: a deterministic, low-chroma tint per name for initials fallbacks
// (avatar, avatar-group, people pickers). The same name always gets the same
// hue; the brand-blue band is skipped so an initials chip never reads as a
// link or a live state. Both colours blend with the surface tokens, so the
// ink keeps 4.5:1 on the tint in light and dark.

export function nameHue(name: string): number {
	let h = 0;
	for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
	const hue = h % 300;
	// Skip 225..285 (the accent's blue band) by folding it past the band.
	return hue < 225 ? hue : hue + 60;
}

/** Inline style for an initials chip: a soft tint fill and a readable ink. */
export function nameTint(name: string): string {
	const h = nameHue(name.trim().toLowerCase() || '?');
	return (
		`background-color:color-mix(in oklab, oklch(0.7 0.09 ${h}) 22%, var(--ripple-surface));` +
		`color:color-mix(in oklab, oklch(0.55 0.12 ${h}) 45%, var(--ripple-surface-foreground))`
	);
}
