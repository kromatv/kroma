import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const SubtitleId = brandedId('SubtitleId');
export type SubtitleId = z.infer<typeof SubtitleId>;

export const GenerationId = brandedId('GenerationId');
export type GenerationId = z.infer<typeof GenerationId>;
