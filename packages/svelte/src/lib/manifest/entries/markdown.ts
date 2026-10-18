import type { WidgetManifestEntry } from '../index.js';

export const markdownEntry: WidgetManifestEntry = {
  type: 'markdown',
  category: 'display',
  description: 'Render markdown with GFM (tables, strikethrough, autolinks, task lists), LaTeX math and mermaid diagrams.',
  props: {
    content: { type: 'string', required: false, description: 'Markdown source. Math: $x$ inline, $$x$$ on its own lines for display; a bare number like $5 stays text. A ```mermaid fence draws as a diagram. Braces read as expressions, so put TeX or mermaid with {} in state and pass "{state.x}".' },
    text: { type: 'string', required: false, description: 'Alias for content.' },
    gfm: { type: 'boolean', required: false, description: 'Enable GitHub-Flavored Markdown. Default true.' },
  },
  example: { type: 'markdown', props: { content: '# Release notes\n\n- Added two-way bind for inputs\n- Fixed `oninput` event\n\n> See PR #26 for details.' } },
};
