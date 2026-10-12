// site/docs/open-in.ts — The docs pages' "Open in" links: a new chat in
// Claude, ChatGPT or PocketPaw (Paw OS) that already asks the assistant to read
// the page's markdown. Claude and ChatGPT take the prompt in `q`; Paw OS gets it
// through the landing's handoff (in the URL fragment, so it never reaches a
// server, cut to HANDOFF_MAX). Hrefs still go through safeUrl where rendered.

import { pawosHandoffUrl } from '../../../routes/pawbar/session.svelte.js';

export interface OpenInLink {
	name: 'Claude' | 'ChatGPT' | 'PocketPaw';
	href: string;
}

/** What the new chat starts with: read this page, then help. */
export function pagePrompt(markdownUrl: string, title: string): string {
	return `Read ${markdownUrl} (the Ripple docs page "${title}"). Ripple renders a model's JSON spec as a live UI. Then help me with it.`;
}

export function openInLinks(prompt: string, pawosUrl?: string): OpenInLink[] {
	const q = encodeURIComponent(prompt);
	return [
		{ name: 'Claude', href: `https://claude.ai/new?q=${q}` },
		{ name: 'ChatGPT', href: `https://chatgpt.com/?hints=search&q=${q}` },
		{ name: 'PocketPaw', href: pawosHandoffUrl(prompt, pawosUrl).url }
	];
}
