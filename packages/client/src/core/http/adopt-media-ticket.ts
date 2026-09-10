import { z } from 'zod';
import type { RequestContext } from './request-context';

const Ticketed = z.object({ mediaTicket: z.string().min(1) });

/** Hand the transport the media ticket a sign-in answered with, so the URLs a
 * player fetches for itself carry it, and pass the answer through untouched. An
 * answer with no ticket in it leaves the held one alone: a poll that is still
 * pending and a server too old to mint one are both silence, not a revocation. */
export async function adoptMediaTicket<T>(ctx: RequestContext, signIn: Promise<T>): Promise<T> {
  const answer = await signIn;
  const ticketed = z.safeParse(Ticketed, answer);
  if (ticketed.success) ctx.setMediaTicket(ticketed.data.mediaTicket);
  return answer;
}
