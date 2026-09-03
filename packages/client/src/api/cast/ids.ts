import type { z } from 'zod';
import { brandedId } from '../../core/ids';

/** A sender (phone or browser) holding a receiver’s remote. */
export const ControllerId = brandedId('ControllerId');
export type ControllerId = z.infer<typeof ControllerId>;
