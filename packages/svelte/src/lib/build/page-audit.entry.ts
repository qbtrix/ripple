// page-audit.entry.ts: the browser entry for `<base>/page-audit.js`. `build:site`
// bundles it (bun build, iife) into static/page-audit.js, which is gitignored.
// Hosts that drive a page from outside (render.mjs, the worker) evaluate that
// script and call `globalThis.ripplePageAudit(root, opts)`. The global lives
// here, not in page-audit.ts, so importing the lib module has no side effect.
import { pageAudit } from './page-audit.js';

(globalThis as { ripplePageAudit?: typeof pageAudit }).ripplePageAudit = pageAudit;
