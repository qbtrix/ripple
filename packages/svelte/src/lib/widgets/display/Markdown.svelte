<!--
  widgets/display/Markdown.svelte — The `markdown` widget: GFM markdown, plus
  LaTeX math ($…$, $$…$$, \(…\), \[…\]) and ```mermaid diagrams.
  - marked runs synchronously (also under SSR) and its output is sanitized
    before {@html}: the source is spec-controlled and may be LLM-authored.
  - Math and diagrams arrive as placeholders holding the source as written
    (utils/markdown-ext.ts). An effect upgrades them in the browser: temml and
    mermaid are dynamic imports, fetched only when a placeholder exists, so a
    card without either pays nothing. A failed render leaves the source.
  - Upgrade output is sanitized again (sanitizeMath, sanitizeSvg) and mermaid
    runs with strict security and SVG-only labels. Diagrams wait until a
    streamed spec is done, so a half-written fence is not parsed every frame.
  - Diagrams take their palette from the --ripple-* tokens at this element and
    redraw when the html class or data-theme changes the palette.
-->
<script lang="ts" module>
  import { Marked } from 'marked';
  import { markedMath, markedMermaid, MATH_CLASS } from '$lib/utils/markdown-ext.js';
  import { mermaidConfig, renderMermaid, resolveColors } from '$lib/utils/mermaid.js';
  import { sanitizeMath, sanitizeSvg } from '$lib/utils/sanitize-html.js';

  const md = new Marked(markedMath(), markedMermaid());

  type Temml = (typeof import('temml'))['default'];
  let temml: Promise<Temml> | undefined;

  function upgradeMath(root: HTMLElement) {
    const spots = [...root.querySelectorAll<HTMLElement>(`.${MATH_CLASS}:not([data-rendered])`)];
    if (!spots.length) return;
    temml ??= import('temml').then((m) => m.default);
    void temml.then((t) => {
      for (const el of spots) {
        if (!el.isConnected || el.dataset.rendered != null) continue;
        try {
          const display = el.dataset.display != null;
          const out = sanitizeMath(t.renderToString(el.dataset.tex ?? '', { displayMode: display, throwOnError: true }));
          if (!out) continue;
          el.innerHTML = out;
          el.dataset.rendered = '';
        } catch {
          // Unparseable TeX: the source stays on screen as written.
        }
      }
    });
  }

  /** Mermaid's url()/@import in CSS (classDef, style) could beacon out; keep only #fragment refs. */
  const stripOutsideRefs = (svg: string) =>
    svg.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, 'none');

  function diagramConfig(root: HTMLElement) {
    const c = resolveColors(
      {
        ground: 'var(--ripple-surface)',
        ink: 'var(--ripple-surface-foreground)',
        soft: 'var(--ripple-muted-foreground)',
        border: 'color-mix(in oklab, var(--ripple-surface-foreground) 28%, transparent)',
        // workflow's lifted card (--wf-card) with a soft accent wash
        card: 'color-mix(in oklab, var(--ripple-accent) 6%, oklch(from var(--ripple-surface-foreground) calc(1.18 - l * 0.92) calc(c * 0.5) h))',
        panel: 'var(--ripple-muted)',
        inset: 'var(--ripple-muted)',
        primary: 'var(--ripple-accent)',
        tint: 'color-mix(in oklab, var(--ripple-accent) 14%, transparent)',
        onPrimary: 'var(--ripple-accent-foreground)'
      },
      root,
      'var(--ripple-surface)'
    );
    return c && mermaidConfig(c, getComputedStyle(root).fontFamily || 'sans-serif', { htmlLabels: false });
  }

  function upgradeDiagrams(root: HTMLElement, alive: () => boolean) {
    const wraps = [...root.querySelectorAll<HTMLElement>('.ripple-diagram')];
    if (!wraps.length) return;
    const config = diagramConfig(root);
    if (!config) return;
    const key = JSON.stringify(config.themeVariables);
    for (const wrap of wraps) {
      if (wrap.dataset.drawn === key) continue;
      const pre = wrap.querySelector('pre');
      const source = pre?.textContent ?? '';
      if (!pre || !source.trim()) continue;
      renderMermaid(source, config).then(
        (svg) => {
          if (!alive() || !wrap.isConnected) return;
          let canvas = wrap.querySelector<HTMLElement>('.ripple-diagram-canvas');
          if (!canvas) {
            canvas = document.createElement('div');
            canvas.className = 'ripple-diagram-canvas';
            wrap.prepend(canvas);
          }
          canvas.innerHTML = sanitizeSvg(stripOutsideRefs(svg));
          pre.hidden = true;
          wrap.dataset.drawn = key;
        },
        (e: unknown) => console.warn('[ripple/markdown] mermaid diagram failed to render:', e)
      );
    }
  }
</script>

<script lang="ts">
  import { getContext } from 'svelte';
  import { cn } from '$lib/utils.js';
  import { sanitizeHtml } from '$lib/utils/sanitize-html.js';

  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    /** Markdown source. Also renders LaTeX math and ```mermaid fences. */
    content?: string;
    /** Alias for `content`. Some specs author this as `text`. */
    text?: string;
    /** Use GitHub-Flavored Markdown features (tables, strikethrough, autolinks). */
    gfm?: boolean;
  }

  let { id, class: className, style, content, text, gfm = true }: Props = $props();

  const streamPhase = getContext<(() => 'active' | 'done' | undefined) | undefined>('ui-streaming');
  let root = $state<HTMLDivElement>();
  let themeTick = $state(0);

  const source = $derived(content ?? text ?? '');

  const html = $derived.by(() => {
    if (!source) return '';
    try {
      // Sanitize before {@html}: markdown source is spec-controlled and may be
      // untrusted (LLM-authored), and marked passes raw HTML through by default,
      // so `<img src=x onerror=…>` in the source would otherwise run as XSS.
      return sanitizeHtml(md.parse(source, { gfm, breaks: true, async: false }) as string);
    } catch (e) {
      console.warn('[ripple/markdown] parse failed:', e);
      return '';
    }
  });

  $effect(() => {
    const mo = new MutationObserver(() => themeTick++);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => mo.disconnect();
  });

  $effect(() => {
    void html;
    if (!root) return;
    upgradeMath(root);
    if (streamPhase?.() === 'active') return;
    void themeTick;
    let alive = true;
    upgradeDiagrams(root, () => alive);
    return () => {
      alive = false;
    };
  });

  const styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );
</script>

<div
  bind:this={root}
  {id}
  class={cn(
    'ripple-markdown text-sm leading-relaxed',
    '[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-2',
    '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2',
    '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
    '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2',
    '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
    '[&_li]:my-1',
    '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80',
    '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
    '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-3',
    '[&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_pre>code]:text-[0.85em]',
    '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
    '[&_table]:w-full [&_table]:border-collapse [&_table]:my-3',
    '[&_th]:border-b [&_th]:border-border [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold',
    '[&_td]:border-b [&_td]:border-border/50 [&_td]:p-2',
    '[&_hr]:my-4 [&_hr]:border-border',
    '[&_.ripple-math-display]:block [&_.ripple-math-display]:my-3 [&_.ripple-math-display]:overflow-x-auto [&_.ripple-math-display]:py-1',
    '[&_.ripple-diagram-canvas]:my-3 [&_.ripple-diagram-canvas]:overflow-x-auto',
    '[&_.ripple-diagram-canvas_svg]:mx-auto [&_.ripple-diagram-canvas_svg]:h-auto [&_.ripple-diagram-canvas_svg]:max-w-full',
    className
  )}
  style={styleString}
>
  {@html html}
</div>

<style>
  /* System math fonts; temml's own CSS and woff2 are not shipped. */
  .ripple-markdown :global(math) {
    font-family: 'STIX Two Math', 'Cambria Math', 'Latin Modern Math', math;
    font-size: 1.1em;
  }
</style>
