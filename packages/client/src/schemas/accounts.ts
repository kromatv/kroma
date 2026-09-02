// Runtime schemas for the accounts domain. Each `export const X` is a zod schema
// and its `export type X` is the inferred wire type they share one name and are
// the single source of truth (there is no generated counterpart). Branded ids
// (e.g. `UserId`) give nominal typing.

import { z } from 'zod';
import { UserId } from './ids';

/** The known capability keys (mirror of the Rust `Permission` enum). */
export const Permission = z.enum([
  'users.manage',
  'library.manage',
  'settings.manage',
  'playback',
  'requests.create',
  'requests.manage',
  'requests.auto',
  'reports.manage',
]);

/** A full account (`GET /auth/me`, login/exchange results). `permissions` is
 * validated as `string[]`, not the closed `Permission` enum: this runs in the
 * auth-critical login/exchange path, so a server that adds a capability must
 * not make an older client throw on an unknown key. */
export const User = z.object({
  id: UserId,
  email: z.string(),
  username: z.string(),
  // `.nullish()`, not `.nullable()`: the server OMITS these `Option` fields
  // when unset, so the key is absent, which `.nullable()` would reject.
  avatarUrl: z.string().nullish(),
  language: z.string().nullish(),
  audioLanguage: z.string().nullish(),
  subtitleLanguage: z.string().nullish(),
  permissions: z.array(z.string()),
  createdAt: z.string(),
  hasPin: z.boolean(),
});
export type User = z.infer<typeof User>;

/** The public (no-email) profile in the picker roster. */
export const PublicUser = z.object({
  id: UserId,
  username: z.string(),
  // Omitted by the server when unset (see the note on `User.avatarUrl`).
  avatarUrl: z.string().nullish(),
  hasPin: z.boolean(),
});
export type PublicUser = z.infer<typeof PublicUser>;

/** Public login-gate config. */
export const AuthConfig = z.object({
  publicUserList: z.boolean(),
  hasAccounts: z.boolean(),
});

/** `{ token, accessToken, user }` from register/login. */
export const AuthResult = z.object({
  token: z.string(),
  accessToken: z.string(),
  user: User,
});

/** `{ token, user }` from `/auth/token` (session refresh/exchange). */
export const SessionResult = z.object({
  token: z.string(),
  user: User,
});

/** One signed-in device from `GET /auth/me/sessions`. `id` is a non-secret
 * handle used to revoke it; `current` marks the device making the request.
 * `userAgent`/`lastSeen` are `.nullish()` (server omits when unknown). */
export const SessionInfo = z.object({
  id: z.string(),
  userAgent: z.string().nullish(),
  createdAt: z.string(),
  lastSeen: z.string().nullish(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;

/** One registered passkey from `GET /auth/me/passkeys`. `id` revokes it. */
export const PasskeyInfo = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  lastUsed: z.string().nullish(),
});
export type PasskeyInfo = z.infer<typeof PasskeyInfo>;

/** `POST /auth/quickconnect/initiate` a device-pairing request. */
export const QuickConnectInit = z.object({
  code: z.string(),
  secret: z.string(),
  expiresInSec: z.number(),
  authorizeUrl: z.string().nullable(),
});
export type QuickConnectInit = z.infer<typeof QuickConnectInit>;

/** `POST /api/admin/users/:id/reset` the link plus the one-time code the owner
 * reads to the user. `delivered` is `manual` | `smtp`. */
export const ResetCreated = z.object({
  token: z.string(),
  code: z.string(),
  url: z.string().nullable(),
  expiresAt: z.number(),
  delivered: z.string(),
});
export type ResetCreated = z.infer<typeof ResetCreated>;

/** `GET /api/auth/reset/:token` the public check before the reset form.
 * Reused by `/api/auth/verify-email/:token`, same shape. */
export const ResetCheck = z.object({
  valid: z.boolean(),
  username: z.string().nullish(),
});
export type ResetCheck = z.infer<typeof ResetCheck>;

/** `POST /api/admin/users/:id/email-verification` the verification link. No
 * code: reaching the mailbox is itself the proof. */
export const VerificationCreated = z.object({
  token: z.string(),
  url: z.string().nullable(),
  expiresAt: z.number(),
  delivered: z.string(),
});
export type VerificationCreated = z.infer<typeof VerificationCreated>;

export type AuthConfig = z.infer<typeof AuthConfig>;
export type AuthResult = z.infer<typeof AuthResult>;
export type Permission = z.infer<typeof Permission>;
export type SessionResult = z.infer<typeof SessionResult>;
