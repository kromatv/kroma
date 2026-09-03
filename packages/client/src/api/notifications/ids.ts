import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const NotificationId = brandedId('NotificationId');
export type NotificationId = z.infer<typeof NotificationId>;
