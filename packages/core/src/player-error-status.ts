import { z } from 'zod';

const PlayerError = z.object({ message: z.string() });

const MEDIA3_STATUS = /Response code: (\d{3})\b/;

/** The HTTP status a platform player's error names, or null when it names none.
 * expo-video hands an error over as text, and Media3 writes the status into it
 * (`Response code: 404`). */
export function playerErrorStatus(error: unknown): number | null {
  const parsed = PlayerError.safeParse(error);
  if (!parsed.success) {
    return null;
  }
  const status = MEDIA3_STATUS.exec(parsed.data.message)?.[1];
  return status === undefined ? null : Number(status);
}
