import type { z } from 'zod';
import { brandedId } from '../../core/ids';

/** A sign-in provider, as the server's configuration names it. */
export const ProviderId = brandedId('ProviderId');
export type ProviderId = z.infer<typeof ProviderId>;

/** One sign-in in flight. */
export const FlowId = brandedId('FlowId');
export type FlowId = z.infer<typeof FlowId>;

/** One provider identity linked to an account. */
export const IdentityId = brandedId('IdentityId');
export type IdentityId = z.infer<typeof IdentityId>;

export const JoinRequestId = brandedId('JoinRequestId');
export type JoinRequestId = z.infer<typeof JoinRequestId>;
