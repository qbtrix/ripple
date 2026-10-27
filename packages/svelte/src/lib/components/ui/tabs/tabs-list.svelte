<!-- tabs-list.svelte: the tab strip. The default variant is the shared chip
     track (components/ui/chip.ts), the same one segmented uses. The strip never
     outgrows its container (max-w-full) and its centring is `safe`, so an
     overflowing strip starts at its first tab instead of pushing it off the left
     edge out of reach. The default track scrolls sideways (scrollbar hidden);
     the line variant doesn't, because a scroller would clip the active
     underline drawn below its triggers. Variant
     classes use the arbitrary data-[…] form, never styles.css shorthands, so
     they work in a consumer that only loads theme.css (host-variants.test.ts
     guards the whole package). -->
<script lang="ts" module>
	import { tv, type VariantProps } from "tailwind-variants";
	import { CHIP_TRACK } from "../chip.js";

	export const tabsListVariants = tv({
		base: "group-data-[orientation=horizontal]/tabs:h-8 data-[variant=line]:rounded-none group/tabs-list text-muted-foreground inline-flex w-fit max-w-full items-center justify-center-safe group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
		variants: {
			variant: {
				default: `cn-tabs-list-variant-default ${CHIP_TRACK} overflow-x-auto [scrollbar-width:none]`,
				line: "cn-tabs-list-variant-line gap-1 bg-transparent",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	});

	export type TabsListVariant = VariantProps<typeof tabsListVariants>["variant"];
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		variant = "default",
		class: className,
		...restProps
	}: TabsPrimitive.ListProps & {
		variant?: TabsListVariant;
	} = $props();
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	data-variant={variant}
	class={cn(tabsListVariants({ variant }), className)}
	{...restProps}
/>
