import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const LlmProviderId = brandedId('LlmProviderId');
export type LlmProviderId = z.infer<typeof LlmProviderId>;
