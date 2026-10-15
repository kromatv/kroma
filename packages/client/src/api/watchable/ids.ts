import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const DownloadId = brandedId('DownloadId');
export type DownloadId = z.infer<typeof DownloadId>;
