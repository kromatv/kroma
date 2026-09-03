import type { z } from 'zod';
import { brandedId } from '../../core/ids';

/** What a phone grants an account against, minted by `POST /handoff/announce`. */
export const HandoffHandle = brandedId('HandoffHandle');
export type HandoffHandle = z.infer<typeof HandoffHandle>;
