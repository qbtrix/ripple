import type { WidgetManifestEntry } from '../index.js';

export const virtualListEntry: WidgetManifestEntry = {
  type: 'virtual-list',
  category: 'data',
  description: 'Virtualized list for large datasets. Renders only visible rows.',
  props: {
    items: { type: 'unknown[]', required: true, description: 'Items to render.' },
    itemHeight: { type: 'number', required: false, description: 'Fixed row height in px.' },
    height: { type: 'string | number', required: false, description: 'Box height; fits rows to 320px.' },
    overscan: { type: 'number', required: false, description: 'Extra rows above/below visible window. Default 5.' },
    emptyText: { type: 'string', required: false, description: 'Text when items is empty.' },
  },
  example: {
    type: 'virtual-list',
    props: {
      items: [
        { label: 'Acorn Labs', description: '3 open deals' },
        { label: 'Bluefin Freight' },
        { label: 'Cobalt Dental' },
      ],
    },
  },
};
