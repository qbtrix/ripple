<!-- tabs-list.svelte: the tab strip. The default variant is the shared chip
     track (components/ui/chip.ts), the same one segmented uses.
     2026-09-18: the horizontal height was written as the styles.css shorthand
     group-data-horizontal, which a consumer never registers, so this strip had
     no height outside this repo. It now uses the arbitrary form, matching the
     vertical rule beside it. host-variants.test.ts guards the whole package. -->
<script lang="ts" module>
	import { tv, type VariantProps } from "tailwind-variants";
	import { CHIP_TRACK } from "../chip.js";

	export const tabsListVariants = tv({
		base: "group-data-[orientation=horizontal]/tabs:h-8 data-[variant=line]:rounded-none group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
		variants: {
			variant: {
				default: `cn-tabs-list-variant-default ${CHIP_TRACK}`,
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
