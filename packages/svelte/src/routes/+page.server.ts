// The landing's streaming code sample, highlighted at prerender so the Lezer
// parsers behind highlightCode stay on the server and out of the page's bundle.
import { highlightCode } from '$lib/site/docs/highlight-code.js';
import type { PageServerLoad } from './$types';

const codeSample = `<script>
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

export const load: PageServerLoad = () => ({ codeSample: highlightCode(codeSample, 'svelte') });
