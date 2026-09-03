import { z } from 'zod';
import { LibraryId } from '../media';

/** A named, multi-folder library (`GET /api/admin/libraries`). */
export const AdminLibrary = z.object({
  id: LibraryId,
  name: z.string(),
  kind: z.string(),
  folders: z.array(z.string()),
  itemCount: z.number(),
  sizeBytes: z.number(),
  lastScan: z.string().nullable(),
  autoScan: z.boolean(),
});
export type AdminLibrary = z.infer<typeof AdminLibrary>;

/** `POST /api/admin/libraries` body. */
export const LibraryBody = AdminLibrary.pick({ name: true, folders: true }).extend({
  kind: z.string().optional(),
});
export type LibraryBody = z.infer<typeof LibraryBody>;

/** `PATCH /api/admin/libraries/:id` body: only the keys present are changed. */
export const LibraryPatch = AdminLibrary.pick({
  name: true,
  kind: true,
  folders: true,
  autoScan: true,
}).exactPartial();
export type LibraryPatch = z.infer<typeof LibraryPatch>;
