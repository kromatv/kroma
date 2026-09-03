import { z } from 'zod';
import type { RequestContext } from '../../core/http';
import type { InviteToken, SessionId } from './ids';
import { passkeysApi } from './passkeys';
import { quickConnectApi } from './quick-connect';
import {
  type AccountPatch,
  AuthConfig,
  AuthResult,
  Invite,
  InviteCreated,
  type Permission,
  PublicUser,
  ResetCheck,
  SessionInfo,
  SessionResult,
  User,
} from './schemas';

const Me = z.object({ user: User });
const InviteCheck = z.object({ valid: z.boolean(), expiresAt: z.number().optional() });
const AvatarUploaded = z.object({ avatarUrl: z.string() });

/** Accounts, sessions, invitations and profile/PIN. */
export default function accountsApi(ctx: RequestContext) {
  return {
    passkeys: passkeysApi(ctx),
    quickConnect: quickConnectApi(ctx),

    /** Create an account and open a session. After the first (owner) account,
     * `inviteToken` is required registration is invite-only. Does NOT set the
     * token; the caller persists it, then calls `setAuthToken`. */
    register: (email: string, username: string, password: string, inviteToken?: InviteToken) =>
      ctx.post('/auth/register', AuthResult, {
        auth: 'public',
        body: { email, username, password, inviteToken },
      }),

    /** Log in with email-or-username + password. */
    login: (identifier: string, password: string) =>
      ctx.post('/auth/login', AuthResult, {
        auth: 'public',
        body: { email: identifier, password },
      }),

    /** Exchange the long-lived access token for a short-lived session token. Pass
     * `pin` when switching into a PIN-locked profile (required on the first
     * exchange; silent refreshes omit it). Throws `KromaApiError` 401 when the PIN
     * is needed or the access token is invalid/expired. */
    exchangeToken: (accessToken: string, pin?: string) =>
      ctx.post('/auth/token', SessionResult, { auth: 'public', body: { accessToken, pin } }),

    /** Re-lock an access token (clear its PIN-verified flag) so the next exchange
     * re-prompts for the PIN. Called when returning to the profile picker. */
    relock: (accessToken: string) =>
      ctx.post('/auth/relock', { auth: 'public', body: { accessToken } }),

    /** Invalidate the current session server-side and revoke the device's access
     * token, a full disconnect. */
    logout: (accessToken?: string) => ctx.post('/auth/logout', { body: { accessToken } }),

    /** The currently-authenticated user (requires a token). */
    me: () => ctx.get('/auth/me', Me),

    /** Update the signed-in account's own profile. Sends only the keys present. */
    update: (patch: AccountPatch) => ctx.patch('/auth/me', Me, { body: patch }),

    /** Persist the preferred UI locale, synced across the account's devices.
     * `null` clears it. */
    updateLanguage: (language: string | null) => ctx.patch('/auth/me', Me, { body: { language } }),

    /** Change the password after verifying the current one. Throws
     * `KromaApiError` on 401 (wrong current) / 400 (too short). A forgotten
     * password goes through the owner-minted reset instead. */
    changePassword: (current: string, next: string) =>
      ctx.patch('/auth/me/password', { body: { current, next } }),

    /** Public login-gate config read before any credential: whether the profile
     * roster is public and whether any account exists yet. */
    config: () => ctx.get('/auth/config', AuthConfig, { auth: 'public' }),

    /** Public profile list for the "Qui regarde ?" picker (no emails). Empty when
     * the `publicUserList` setting is off. */
    users: () => ctx.get('/users', PublicUser.array()),

    /** Verify a profile-lock PIN with the remembered token (TV switch-in). Throws
     * `KromaApiError` on 401 (wrong) / 429 (locked out; the error's `retryAfter`
     * seconds are surfaced as a cooldown). */
    verifyPin: (pin: string) => ctx.post('/auth/pin/verify', { body: { pin } }),

    /** Set or rotate the PIN. `current` is required when one is already set. */
    setPin: (pin: string, current?: string) =>
      ctx.patch('/auth/me/pin', Me, { body: { pin, current } }),

    /** Clear the PIN, verifying `current`. */
    clearPin: (current: string) => ctx.delete('/auth/me/pin', Me, { body: { current } }),

    /** Upload the current user's avatar (raw image bytes). */
    uploadAvatar: (file: Blob) => ctx.upload('/users/avatar', file, AvatarUploaded),

    /** The account's active devices, newest first, the current one flagged. */
    sessions: () => ctx.get('/auth/me/sessions', SessionInfo.array()),

    /** Revoke one of the account's own devices, signing it out. */
    revokeSession: (id: SessionId) => ctx.delete('/auth/me/sessions/:id', { params: { id } }),

    /** Check a credential-reset token (public, used by the reset page). */
    checkReset: (token: string) => ctx.get('/auth/reset/:token', ResetCheck, { params: { token } }),

    /** Redeem a credential reset: the link token plus the code the owner read to
     * the user. Throws `KromaApiError` 400 when invalid or locked. */
    redeemReset: (token: string, code: string, password: string) =>
      ctx.post('/auth/reset', { body: { token, code, password } }),

    /** Ask the owner for a credential reset, from the sign-in screen. Always
     * succeeds whether or not `identifier` names an account, so the screen never
     * reveals who is registered; throttled per source IP. */
    requestReset: (identifier: string) => ctx.post('/auth/reset-request', { body: { identifier } }),

    /** Check an email-verification token (public, used by the verify page). */
    checkEmailVerification: (token: string) =>
      ctx.get('/auth/verify-email/:token', ResetCheck, { params: { token } }),

    /** Confirm an email verification. Throws `KromaApiError` 400 when unknown,
     * expired, used, or the address changed since minting. */
    confirmEmailVerification: (token: string) =>
      ctx.post('/auth/verify-email', { body: { token } }),

    /** Pending invites (requires `users.manage`). */
    invites: () => ctx.get('/invites', Invite.array()),

    /** Mint a registration invite (requires `users.manage`). */
    createInvite: (opts?: { permissions?: Permission[]; expiresInDays?: number }) =>
      ctx.post('/invites', InviteCreated, { body: opts ?? {} }),

    /** Check an invite token's validity (public, used by the join page). */
    checkInvite: (token: InviteToken) =>
      ctx.get('/invites/:token', InviteCheck, { params: { token } }),

    /** Revoke an invite (requires `users.manage`). */
    revokeInvite: (token: InviteToken) => ctx.delete('/invites/:token', { params: { token } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    accounts: ReturnType<typeof accountsApi>;
  }
}
