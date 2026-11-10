import { z } from 'zod';

const MAX_ANSWER_CHARS = 16_384;

const Answer = z.object({
  access_token: z.string().min(1).max(4096),
  userId: z.string().min(1).max(256),
  inputEmailID: z.email().max(254).optional(),
});

export interface SamsungAccess {
  accessToken: string;
  userId: string;
  email: string | null;
}

/** What a Samsung sign-in answered, as the certificate service wants it. */
export function parseAccess(answer: string): SamsungAccess {
  if (answer.length > MAX_ANSWER_CHARS) throw new Error('the sign-in answer is far too long');

  let json: unknown;
  try {
    json = JSON.parse(answer);
  } catch {
    throw new Error('Samsung answered the sign-in with something that is not JSON');
  }
  const parsed = Answer.safeParse(json);
  if (!parsed.success) throw new Error('the sign-in answer carries no access token: sign in again');
  return {
    accessToken: parsed.data.access_token,
    userId: parsed.data.userId,
    email: parsed.data.inputEmailID ?? null,
  };
}
