import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const ModuleId = brandedId('ModuleId');
export type ModuleId = z.infer<typeof ModuleId>;
