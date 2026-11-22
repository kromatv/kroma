import type { Import } from '@kromatv/client/imports';
import type { KeptSignInRef } from '#web/features/admin/import/use-forget-sign-in.hook';

/** A sign-in KROMA keeps, under the name of the server it reaches. */
export interface KeptRow extends KeptSignInRef {
  server: string;
}

/** The sign-ins the imports still hold, one row per sign-in, in the order the
 * imports came. An import whose sign-in was forgotten holds none. */
export function keptSignIns(imports: readonly Import[]): KeptRow[] {
  const rows = new Map<string, KeptRow>();
  for (const held of imports) {
    if (held.signIn && !rows.has(held.signIn)) {
      rows.set(held.signIn, {
        importer: held.importer,
        signIn: held.signIn,
        server: held.server.name || held.server.id,
      });
    }
  }
  return [...rows.values()];
}
