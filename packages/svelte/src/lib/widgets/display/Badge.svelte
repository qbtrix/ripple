<!-- src/lib/widgets/display/Badge.svelte
     origin: slev12397/beautiful-ui@ff0f74d components/atoms/StatusPill.tsx

     A short label pill. Geometry is the source pill (rounded-full, min-h-6,
     px-2.5, 13px medium) and every variant is a tint: the tone at 10% behind
     the tone's readable -text token. Text never uses a fill token (accent or
     status), which measures 2.8 to 4:1 as text; the -text tokens reach 4.5:1
     on card, muted and tinted grounds (guarded by ui/status-text.test.ts).
     A long label wraps inside the card (an unbroken URL breaks anywhere) and
     the 12px radius keeps a one-line badge a full pill. An empty label
     renders nothing, and a variant outside the enum falls back to the
     default accent tint, not the outline look. Classes ride
     `class` through twMerge so the shared shadcn badge stays untouched; the
     node id is forwarded as id + data-ripple-node for the visual editor.
-->
<script lang="ts">
  import { cn } from '$lib/utils.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { asText } from '$lib/widgets/text-coerce';

  interface Props {
    id?: string;
    text?: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
    class?: string;
  }

  let { id, text = '', variant = 'default', class: className }: Props = $props();

  // The source pill's geometry and rhythm, overriding the shadcn base
  // (h-5 / rounded-4xl / px-2 / text-xs) through twMerge.
  const pill =
    'h-auto min-h-6 max-w-full min-w-0 gap-1.5 rounded-[12px] px-2.5 py-1 text-[13px] leading-[1.25] font-medium whitespace-normal text-left [overflow-wrap:anywhere]';

  // Tint per tone. `destructive` is left out on purpose: the shadcn variant is
  // already bg-destructive/10 + text-ripple-error-text, i.e. the same tint shape.
  // Known gap (translation doc §7, not fixed here): destructive routes to the
  // host's --destructive while success/warning use ripple tokens, so a
  // rethemed host gets a red that does not match its siblings.
  const variantMap: Record<string, string> = {
    default: 'bg-ripple-accent/10 text-ripple-accent-text border-transparent',
    secondary: 'bg-ripple-muted text-ripple-muted-foreground border-transparent',
    success: 'bg-ripple-success/10 text-ripple-success-text border-transparent',
    warning: 'bg-ripple-warning/10 text-ripple-warning-text border-transparent',
  };

  // Anything outside the enum ('primary', typos) reads as the default tint.
  const tone = $derived(
    Object.hasOwn(variantMap, variant) || variant === 'destructive' || variant === 'outline' ? variant : 'default'
  );

  const shadcnVariant = $derived(
    ['default', 'secondary', 'destructive', 'outline'].includes(tone)
      ? tone as 'default' | 'secondary' | 'destructive' | 'outline'
      : 'outline'
  );

  const extraClass = $derived(variantMap[tone] ?? '');

  // Bindings deliver numbers/booleans as readily as strings ({state.x.score}).
  // Coerce before the emptiness check — .trim() exists only on strings, and a
  // non-string prop must render, not crash the canvas.
  const label = $derived(asText(text));
</script>

<!-- Empty guard: an empty badge (no text) would render as a bare bordered pill —
     a stray-circle artifact in cards. Render nothing when there's no content. -->
{#if label.trim()}
  <Badge {id} data-ripple-node={id} variant={shadcnVariant} class={cn(pill, extraClass, className)}>
    {label}
  </Badge>
{/if}
