import type { z } from 'zod';
import { brandedId } from '../../core/ids';

/** The reference an importer gives for a sign-in it keeps. The sign-in itself
 * never leaves the importer. */
export const ImportSignInId = brandedId('ImportSignInId');
export type ImportSignInId = z.infer<typeof ImportSignInId>;

/** A server of another media stack, as its own sign-in names it. */
export const ImportServerId = brandedId('ImportServerId');
export type ImportServerId = z.infer<typeof ImportServerId>;
