import type { WidgetManifestEntry } from '../index.js';

export const savedViewsEntry: WidgetManifestEntry = {
  type: 'saved-views',
  category: 'vertical',
  description: 'Saved filter views as chips with optional counts.',
  props: {
    views: { type: 'Array<{ id: string; label: string; icon?: string; pinned?: boolean; count?: number }>', required: true, description: 'Saved views.' },
    value: { type: 'string | null', required: false, description: 'Currently active view id (use with bind).' },
    canCreate: { type: 'boolean', required: false, description: 'Show "+ New view" button.' },
  },
  example: {
    type: 'saved-views',
    props: {
      value: 'all',
      canCreate: true,
      views: [
        { id: 'all', label: 'All issues', count: 142, pinned: true },
        { id: 'assigned', label: 'Assigned to me', count: 8 },
        { id: 'high-priority', label: 'High priority', icon: 'alert-circle', count: 23 },
        { id: 'closed', label: 'Closed', count: 2847 },
      ],
    },
  },
};
