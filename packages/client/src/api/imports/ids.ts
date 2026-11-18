import type { z } from 'zod';
import { brandedId } from '../../core/ids';

/** One import of another media server into this one. */
export const ImportId = brandedId('ImportId');
export type ImportId = z.infer<typeof ImportId>;
