import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const ReportId = brandedId('ReportId');
export type ReportId = z.infer<typeof ReportId>;
