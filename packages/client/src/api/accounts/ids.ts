import type { z } from 'zod';
import { brandedId } from '../../core/ids';

export const UserId = brandedId('UserId');
export type UserId = z.infer<typeof UserId>;

/** One signed-in device of an account, as `GET /auth/me/sessions` lists it.
 * Not a `PlaybackSessionId`: this one revokes a login, that one stops a play. */
export const SessionId = brandedId('SessionId');
export type SessionId = z.infer<typeof SessionId>;

export const PasskeyId = brandedId('PasskeyId');
export type PasskeyId = z.infer<typeof PasskeyId>;

export const CeremonyId = brandedId('CeremonyId');
export type CeremonyId = z.infer<typeof CeremonyId>;

export const InviteToken = brandedId('InviteToken');
export type InviteToken = z.infer<typeof InviteToken>;
