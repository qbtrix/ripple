// site/setup-prompt.ts — The prompt a visitor hands to their coding agent
// (Claude Code, Cursor, Codex) to add Ripple to a project. One source: the
// landing's band copies it, and the Install docs page shows the same text in
// a fence (setup-prompt.test.ts holds the two together). Written for an agent:
// docs as markdown URLs, ordered steps that each end in something checkable,
// a stop when the stack is wrong, questions instead of guesses, and a
// definition of done. Every URL here must answer 200 on the live site.

import { SITE_URL, SLIM_MANIFEST_URL } from './docs/model.js';

const doc = (path: string) => `${SITE_URL}/docs/${path}.md`;

export const SETUP_PROMPT = `Add Ripple to this project: a model writes a UI as a JSON spec, and the app renders it live while the JSON streams in.

Read these first (agent-friendly markdown):
- ${SITE_URL}/llms.txt (index of every page)
- ${doc('getting-started/install')}
- ${doc('getting-started/stream-a-spec')}
- ${doc('guides/prompting')}

Steps:
1. Check the stack. The renderer needs Svelte 5 and Tailwind CSS v4. If this app is not Svelte 5, stop and tell me instead of adding Svelte (${doc('concepts/headless')} covers rendering elsewhere).
2. Install @ripple-ui/svelte with the package manager this repo already uses.
3. Styles: follow "Set up Tailwind" on the Install page. Choose styles.css or theme.css by whether the app already defines shadcn tokens, and write the @source path relative to the CSS file.
4. Smoke test: render {"version":"1.0","ui":{"type":"text","props":{"text":"Ripple is installed."}}} on a page. If it shows unstyled, fix the @source path before going on.
5. Streaming: add a server endpoint that streams the model's text and a page that passes the response body to streamSpec and renders <Ripple streaming={store}>, as on the Stream a spec page. Reuse the model SDK this repo already has; if there is none, ask me which provider to use. Keep API keys in server-side env vars.
6. System prompt: build it on the server from a manifest, as on the Prompting page. Start with the slim manifest (${SLIM_MANIFEST_URL}) or trim @ripple-ui/svelte/manifest.json to the widgets we need. The model must reply with one JSON object: no prose, no code fences.
7. Validation: when a stream ends, check the spec with specIssues and formatSpecIssues from @ripple-ui/svelte. Send any issues back to the model and retry at most twice.

Rules: use only widgets, props and actions from the manifest. Never edit node_modules. Keep the change small and follow this repo's conventions.

Done when the smoke test renders styled, one request to the endpoint streams a UI that grows on screen, and the project's type check and tests pass. Then list the files you changed and anything you could not verify.`;
