import type { WidgetManifestEntry } from '../index.js';

export const gaugeEntry: WidgetManifestEntry = {
  type: 'gauge',
  category: 'data',
  description: 'Circular gauge showing progress or single KPI as 0..max arc.',
  props: {
    value: { type: 'number', required: true, description: 'Current value.' },
    max: { type: 'number', required: false, description: 'Maximum value. Default 100.' },
    label: { type: 'string', required: false, description: 'Gauge label.' },
    color: { type: 'string', required: false, description: 'Custom gauge color.' },
    height: { type: 'number', required: false, description: 'Max height in px.' },
    title: { type: 'string', required: false, description: 'Title above gauge.' },
    currency: { type: 'string', required: false, description: 'ISO 4217 code for money gauges ("USD"). Formats value, target, over and to go; never put a symbol in the numbers. Shows the value, not a percent.' },
    unit: { type: 'string', required: false, description: 'Plain suffix for every amount when there is no currency ("GB", "steps"). Shows the value, not a percent. Shares always print up to one decimal (72.8%).' },
  },
  example: { type: 'gauge', props: { value: 75, max: 100, label: 'Capacity', height: 240 } },
};
