// Branded id types nominal `string`s so a `UserId` can never be passed where an
// `ItemId` is expected. Turn a raw string into a brand with `UserId.of(s)`, an
// alias for `UserId.parse(s)`.

import { z } from 'zod';

export function brandedId<const B extends string>(_brand: B) {
  const schema = z.string().brand<B>();
  // `parse` does the real validation; the assertion only re-applies the brand
  // the compiler can't see through the generic `B`.
  const of = (s: string) => schema.parse(s) as z.infer<typeof schema>;
  return Object.assign(schema, { of });
}

export const UserId = brandedId('UserId');
export type UserId = ReturnType<typeof UserId.of>;

export const ItemId = brandedId('ItemId');
export type ItemId = ReturnType<typeof ItemId.of>;

export const ShowId = brandedId('ShowId');
export type ShowId = ReturnType<typeof ShowId.of>;

export const RequestId = brandedId('RequestId');
export type RequestId = ReturnType<typeof RequestId.of>;

export const ReportId = brandedId('ReportId');
export type ReportId = ReturnType<typeof ReportId.of>;

export const IndexerId = brandedId('IndexerId');
export type IndexerId = ReturnType<typeof IndexerId.of>;

export const JobRunId = brandedId('JobRunId');
export type JobRunId = ReturnType<typeof JobRunId.of>;

export const LibraryId = brandedId('LibraryId');
export type LibraryId = ReturnType<typeof LibraryId.of>;

export const NotificationId = brandedId('NotificationId');
export type NotificationId = ReturnType<typeof NotificationId.of>;
