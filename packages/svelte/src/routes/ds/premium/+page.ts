// routes/ds/premium/+page.ts: the effects page moved to /ds/effects; this keeps
// old links working. A prerendered redirect is written as a meta-refresh page.
import { redirect } from '@sveltejs/kit';

export const load = () => redirect(308, '/ds/effects');
