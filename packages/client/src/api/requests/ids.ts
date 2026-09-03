import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const RequestId = brandedId('RequestId');
export type RequestId = z.infer<typeof RequestId>;

export const WantedId = brandedId('WantedId');
export type WantedId = z.infer<typeof WantedId>;

export const IndexerId = brandedId('IndexerId');
export type IndexerId = z.infer<typeof IndexerId>;
