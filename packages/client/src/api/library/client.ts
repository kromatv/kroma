import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import { AdminFsList } from '../admin';
import { LibraryId } from '../media';
import { AdminLibrary, type LibraryBody, type LibraryPatch } from './schemas';

const Libraries = z.object({ libraries: z.array(AdminLibrary) });
const LibraryCreated = z.object({ id: LibraryId });

/** Admin library management: folders, scans, and the server-side folder picker. */
export default function libraryApi(ctx: RequestContext) {
  return {
    /** Libraries with folders, size and item counts (needs an admin capability). */
    list: () => ctx.get('/admin/libraries', Libraries),

    /** Add a library and trigger a rescan (requires `library.manage`). */
    create: (body: LibraryBody) => ctx.post('/admin/libraries', LibraryCreated, { body }),

    /** Rename, change folders or toggle auto-scan for a library. */
    update: (id: LibraryId, patch: LibraryPatch) =>
      ctx.patch('/admin/libraries/:id', { params: { id }, body: patch }),

    /** Remove a library (its items are dropped on the ensuing rescan). */
    delete: (id: LibraryId) => ctx.delete('/admin/libraries/:id', { params: { id } }),

    /** Kick a full rescan (from the libraries page). */
    scan: (id: LibraryId) => ctx.post('/admin/libraries/:id/scan', { params: { id } }),

    /** Browse server-side directories for the folder picker. An empty or absent
     * `path` returns the roots (NAS volumes, or `/` in dev). */
    browse: (path?: string) => ctx.get('/admin/libraries/browse', AdminFsList, { query: { path } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    library: ReturnType<typeof libraryApi>;
  }
}
