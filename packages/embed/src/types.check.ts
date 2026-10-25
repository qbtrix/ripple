// src/types.check.ts: compile-time only. Fails `bun run check` when the
// implementation (index.ts) and the published types (../index.d.ts) disagree.
import type * as Public from '../index.js';
import * as impl from './index.js';

export const implMatchesPublic: typeof Public.mount = impl.mount;
export const publicMatchesImpl: typeof impl.mount = null as unknown as typeof Public.mount;
