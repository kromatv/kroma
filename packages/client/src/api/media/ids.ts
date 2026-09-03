import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const ItemId = brandedId('ItemId');
export type ItemId = z.infer<typeof ItemId>;

export const ShowId = brandedId('ShowId');
export type ShowId = z.infer<typeof ShowId>;

/** What a rematch, a report or a pipeline task is aimed at: one catalog element,
 * either kind. The wire carries the bare id and the kind beside it. */
export type SubjectId = ItemId | ShowId;

export const MediaFileId = brandedId('MediaFileId');
export type MediaFileId = z.infer<typeof MediaFileId>;

export const LibraryId = brandedId('LibraryId');
export type LibraryId = z.infer<typeof LibraryId>;
