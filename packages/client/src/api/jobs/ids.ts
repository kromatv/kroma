import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const JobKey = brandedId('JobKey');
export type JobKey = z.infer<typeof JobKey>;

export const JobRunId = brandedId('JobRunId');
export type JobRunId = z.infer<typeof JobRunId>;
