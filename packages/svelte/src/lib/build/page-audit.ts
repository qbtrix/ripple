// page-audit.ts: the render audit of one mounted Ripple card, measured in a
// real browser from the DOM alone (no Svelte, no imports, no model).
//
// One copy serves every host: the skill's render.mjs and the worker load the
// built `<base>/page-audit.js` (page-audit.entry.ts, bundled into static/ by
// `build:site`) and call `globalThis.ripplePageAudit`; the chat page imports
// `pageAudit` from here. axe stays out (heavy, and the chat page has 300 ms).
//
// Invariants: the item strings and their order are what render.mjs has always
// written to audit.json, so a CLI run before and after the lift is
// byte-identical. Every item has one box, so `counts[c]` equals the number of
// boxes with `check: c`, in the same order, so a host can zip them. A box
// names the widget type it sits in (the nearest `data-widget`): render-tier
// waivers match on it, since most widgets drop `data-ripple-node`. Boxes are
// CSS px relative to `root`'s top left; the
// renderer's PNGs are shot at device scale 2. notRendered, themeNotApplied and
// consoleErrors cannot be read from the DOM: they come back 0 and the host
// fills them in.

export type PageCheck =
	| 'notRendered'
	| 'themeNotApplied'
	| 'errorBoxes'
	| 'consoleErrors'
	| 'overflow'
	| 'clippedText'
	| 'emptyContainers'
	| 'badText';

/** One offender: where it sits on the shot, the Ripple node id it belongs to when it has one, and the widget type it sits in (nearest `data-widget`), which is what a waiver keys on. */
export interface Box {
	check: PageCheck;
	node?: string;
	widget?: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface PageAudit {
	counts: Record<PageCheck, number>;
	items: Record<PageCheck, string[]>;
	boxes: Box[];
	/** `root`'s size, rounded. */
	width: number;
	height: number;
}

export interface PageAuditOptions {
	/** Extra error selectors searched over the whole document (the playground's own alerts). */
	documentErrors?: string;
}

/**
 * Audits the card under `root` (the shot surface, or the card's own box). The
 * card's `.ripple-root` is looked up inside it; overflow is measured against
 * `root`'s edges.
 */
export function pageAudit(root: Element, opts: PageAuditOptions = {}): PageAudit {
	const checks: PageCheck[] = ['notRendered', 'themeNotApplied', 'errorBoxes', 'consoleErrors', 'overflow', 'clippedText', 'emptyContainers', 'badText'];
	const items = Object.fromEntries(checks.map((c) => [c, [] as string[]])) as Record<PageCheck, string[]>;
	const boxes: Box[] = [];
	const card = root.querySelector('.ripple-root') ?? root;
	const r = root.getBoundingClientRect();
	const add = (check: PageCheck, el: Element, message: string) => {
		items[check].push(message);
		const b = el.getBoundingClientRect();
		const node = el.getAttribute('data-ripple-node-error') ?? el.closest('[data-ripple-node]')?.getAttribute('data-ripple-node') ?? undefined;
		const widget = el.closest('[data-widget]')?.getAttribute('data-widget') ?? undefined;
		boxes.push({ check, ...(node ? { node } : {}), ...(widget ? { widget } : {}), x: Math.round(b.left - r.left), y: Math.round(b.top - r.top), w: Math.round(b.width), h: Math.round(b.height) });
	};
	const where = (el: Element) => {
		const node = el.closest('[data-ripple-node]')?.getAttribute('data-ripple-node');
		const w = el.closest('[data-widget]')?.getAttribute('data-widget');
		const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 2).join('.') : '';
		return [w && `widget=${w}`, node && `node=${node}`, `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`].filter(Boolean).join(' ');
	};
	const visible = (el: Element) => {
		const s = getComputedStyle(el);
		if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
		const b = el.getBoundingClientRect();
		return b.width > 0 && b.height > 0;
	};
	const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);

	// Render errors: the node boundary, an unknown type (plus any host alerts).
	const errSel = '[data-ripple-node-error], [data-ripple-unknown-widget]';
	const errs = opts.documentErrors ? root.ownerDocument.querySelectorAll(`${errSel}, ${opts.documentErrors}`) : root.querySelectorAll(errSel);
	for (const el of errs) add('errorBoxes', el, `${where(el)}: ${text(el)}`);

	// Drawing internals (paths, groups inside an svg) are not layout boxes; the svg itself is.
	const all = [...card.querySelectorAll('*')].filter((el) => !el.parentElement?.closest('svg') && visible(el));
	const clips = (el: Element) => ['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(el).overflowX);
	const clippedByAncestor = (el: Element) => {
		for (let p = el.parentElement; p && p !== root; p = p.parentElement) if (clips(p)) return true;
		return false;
	};

	// Horizontal overflow: the root or a box inside it scrolls sideways, or an
	// unclipped element pokes past the root's edge (outermost offender only).
	if (root.scrollWidth > root.clientWidth + 1) add('overflow', root, `surface scrollWidth ${root.scrollWidth} > ${root.clientWidth}`);
	for (const el of all) {
		const s = getComputedStyle(el);
		if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1)
			add('overflow', el, `${where(el)} scrolls sideways ${el.scrollWidth} > ${el.clientWidth}`);
		const b = el.getBoundingClientRect();
		if ((b.right > r.right + 1 || b.left < r.left - 1) && !clippedByAncestor(el)) {
			const p = el.parentElement?.getBoundingClientRect();
			if (p && (p.right > r.right + 1 || p.left < r.left - 1)) continue;
			add('overflow', el, `${where(el)} spans ${Math.round(b.left - r.left)}..${Math.round(b.right - r.left)} of ${Math.round(r.width)}`);
		}
	}

	// Clipped text: an element's own text runs past its box and the box cuts it
	// (overflow hidden/clip, ellipsis, a line clamp). overflow:hidden does not
	// excuse it: the reader still loses the words. Measured on the text itself
	// (a Range), so positioned children do not count.
	for (const el of all) {
		const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent?.trim());
		if (!nodes.length || el.closest('svg, canvas, [aria-hidden="true"]')) continue;
		const s = getComputedStyle(el);
		const clamp = s.webkitLineClamp;
		// Visually hidden screen-reader text (sr-only: 1px box, clipped) is meant to be clipped.
		if (el.clientWidth <= 2 || el.clientHeight <= 2 || (s.clip && s.clip !== 'auto') || s.clipPath.startsWith('inset(50%')) continue;
		const cutsX = s.overflowX !== 'visible' || s.textOverflow === 'ellipsis';
		const cutsY = s.overflowY !== 'visible' || clamp !== 'none';
		if (!cutsX && !cutsY) continue;
		const box = el.getBoundingClientRect();
		let wide = 0,
			tall = 0;
		for (const n of nodes) {
			const range = document.createRange();
			range.selectNodeContents(n);
			const t = range.getBoundingClientRect();
			wide = Math.max(wide, t.right - box.right, box.left - t.left);
			tall = Math.max(tall, t.bottom - box.bottom);
		}
		// A clipped single line still lays out at full width inside its box, so scrollWidth tells it.
		if (cutsX && s.whiteSpace.includes('nowrap')) wide = Math.max(wide, el.scrollWidth - el.clientWidth);
		if (clamp !== 'none') tall = Math.max(tall, el.scrollHeight - el.clientHeight);
		if ((cutsX && wide > 1) || (cutsY && tall > 2))
			add('clippedText', el, `${where(el)} "${text(el)}" (${wide > 1 ? `${Math.round(wide)}px cut sideways` : `${Math.round(tall)}px cut below`})`);
	}

	// Inputs hold their words in a value, not a text node: a value wider than its
	// box is cut the same way (a 20-character name in a narrow name field).
	for (const el of card.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
		if (!visible(el) || !el.value || ['checkbox', 'radio', 'range', 'color', 'hidden', 'file'].includes(el.type)) continue;
		const cut = el.scrollWidth - el.clientWidth;
		if (cut > 1) add('clippedText', el, `${where(el)} value "${el.value.slice(0, 40)}" (${Math.round(cut)}px cut sideways)`);
	}

	// Chart and drawing labels: svg text cut by its own svg's edge (a last axis tick "14:2").
	for (const t of card.querySelectorAll<SVGTextElement>('svg text')) {
		const svg = t.ownerSVGElement;
		if (!svg || !visible(svg) || !(t.textContent ?? '').trim()) continue;
		const sb = svg.getBoundingClientRect();
		const tb = t.getBoundingClientRect();
		if (tb.width === 0) continue;
		const cut = Math.max(tb.right - sb.right, sb.left - tb.left, tb.bottom - sb.bottom, sb.top - tb.top);
		if (cut > 1 && getComputedStyle(svg).overflow !== 'visible')
			add('clippedText', t, `${where(svg)} svg text "${(t.textContent ?? '').trim().slice(0, 30)}" (${Math.round(cut)}px past the svg edge)`);
	}

	// Empty containers: a visible in-flow box of real size with no text, no media, no control, no drawing.
	const MEDIA = 'img, svg, canvas, video, iframe, input, textarea, select, button, [role="img"], [role="slider"], [role="progressbar"], [role="separator"], hr';
	for (const el of all) {
		const b = el.getBoundingClientRect();
		if (b.width < 40 || b.height < 40) continue;
		if (el.matches(MEDIA) || el.querySelector(MEDIA)) continue;
		if ((el.textContent ?? '').trim()) continue;
		const s = getComputedStyle(el);
		if (s.backgroundImage !== 'none') continue;
		// Decoration (rings, glows, overlays) is positioned or hidden from assistive tech.
		if (s.position === 'absolute' || s.position === 'fixed' || el.closest('[aria-hidden="true"]')) continue;
		const parent = el.parentElement;
		if (parent && !(parent.textContent ?? '').trim() && parent !== card && card.contains(parent)) {
			const pb = parent.getBoundingClientRect();
			if (pb.width >= 40 && pb.height >= 40) continue; // report the outermost only
		}
		add('emptyContainers', el, `${where(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
	}

	// Leaked values in visible text.
	const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
	const BAD = /\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b|\{state\.|Infinity/;
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const el = n.parentElement;
		if (!el || !visible(el) || !BAD.test(n.textContent ?? '')) continue;
		add('badText', el, `${where(el)} "${(n.textContent ?? '').trim().slice(0, 60)}"`);
	}
	// Text that looks like a JSON object or array printed raw.
	for (const el of all) {
		const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
		if (/^[{[]\s*"[^"]+"\s*:/.test(t)) add('badText', el, `${where(el)} raw JSON "${t.slice(0, 60)}"`);
	}

	const counts = Object.fromEntries(checks.map((c) => [c, items[c].length])) as Record<PageCheck, number>;
	return { counts, items, boxes, width: Math.round(r.width), height: Math.round(r.height) };
}
