import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const PlaybackSessionId = brandedId('PlaybackSessionId');
export type PlaybackSessionId = z.infer<typeof PlaybackSessionId>;
