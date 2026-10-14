<script lang="ts">
  import { safeStyle } from '@ripple-ui/core';
  import PhotoTile from '$lib/widgets/data-kit/PhotoTile.svelte';
  import ImageIcon from '@lucide/svelte/icons/image';
  interface Props {
    id?: string;
    class?: string;
    style?: Record<string, string>;
    src?: string;
    alt?: string;
    width?: number | string;
    height?: number | string;
    fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  }

  let {
    id, class: className, style, src = '', alt = '',
    width, height, fit = 'cover', rounded = 'md'
  }: Props = $props();

  const radiusMap: Record<string, string> = {
    none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px'
  };

  const combinedStyle = $derived.by(() => {
    const s: string[] = [`border-radius:${radiusMap[rounded] ?? '8px'}`];
    if (width) s.push(`width:${typeof width === 'number' ? `${width}px` : width}`);
    if (height) s.push(`height:${typeof height === 'number' ? `${height}px` : height}`);
    if (style) s.push(...Object.entries(style).map(([k, v]) => `${k}:${v}`));
    return safeStyle(s.join(';'));
  });
</script>

<!-- PhotoTile owns loading, missing, refused and failed src: a designed icon
     tile at the requested size, never the browser's broken-image glyph. -->
<PhotoTile {id} {src} {alt} {fit} ratio="auto" icon={ImageIcon} caption class="block max-w-full {className ?? ''}" style={combinedStyle} />
