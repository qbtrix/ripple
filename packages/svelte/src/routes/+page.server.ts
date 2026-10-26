// The landing's streaming code samples, one per framework tab (Svelte, React,
// HTML through @ripple-ui/embed), highlighted at prerender so the Lezer
// parsers behind highlightCode stay on the server and out of the page's
// bundle. Keys match the band's framework switch in +page.svelte. Svelte
// streams through streamSpec; React and the embed take the text so far.
import { highlightCode } from '$lib/site/docs/highlight-code.js';
import type { PageServerLoad } from './$types';

const svelte = `<script>
  import { Ripple } from '@ripple-ui/svelte';
  import { streamSpec } from '@ripple-ui/svelte/streaming';

  let store = $state(null);

  async function generate(prompt) {
    // your endpoint asks the model for a spec and streams the JSON back
    const res = await fetch('/api/ui', { method: 'POST', body: prompt });
    store = streamSpec(res.body);
  }
</script>

{#if store}<Ripple streaming={store} skeleton="card" />{/if}`;

const react = `import { useState } from 'react';
import { Ripple } from '@ripple-ui/react';

export function Answer() {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);

  async function generate(prompt) {
    // your endpoint asks the model for a spec and streams the JSON back
    const res = await fetch('/api/ui', { method: 'POST', body: prompt });
    for await (const part of res.body.pipeThrough(new TextDecoderStream())) setText((t) => t + part);
    setDone(true);
  }

  return text ? <Ripple spec={text} streaming={!done} /> : null;
}`;

const html = `import { mount } from '@ripple-ui/embed';

async function generate(prompt) {
  // your endpoint asks the model for a spec and streams the JSON back
  const res = await fetch('/api/ui', { method: 'POST', body: prompt });
  const card = mount(document.querySelector('#card'), '', { streaming: true });
  let text = '';
  for await (const part of res.body.pipeThrough(new TextDecoderStream())) card.update((text += part));
  card.finish();
}`;

export const load: PageServerLoad = () => ({
	codeSamples: { svelte: highlightCode(svelte, 'svelte'), react: highlightCode(react, 'tsx'), html: highlightCode(html, 'js') }
});
