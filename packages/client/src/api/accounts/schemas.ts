import { z } from 'zod';
import { InviteToken, PasskeyId, SessionId, UserId } from './ids';

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
export type Permission = z.infer<typeof Permission>;

/** A full account (`GET /auth/me`, login/exchange results). `permissions` is
 * validated as `string[]`, not the closed {@link Permission} enum: this runs in
 * the auth-critical login/exchange path, so a server that adds a capability must
 * not make an older client throw on an unknown key. */
export const User = z.object({
  id: UserId,
  email: z.string(),
  username: z.string(),
  avatarUrl: z.string().nullish(),
  language: z.string().nullish(),
  audioLanguage: z.string().nullish(),
  subtitleLanguage: z.string().nullish(),
  permissions: z.array(z.string()),
  createdAt: z.string(),
  hasPin: z.boolean(),
});
export type User = z.infer<typeof User>;

/** True if the user holds `permission`. Tolerates a missing `permissions` array
 * so a session persisted by an older client (before capabilities existed)
 * degrades to "no permissions" instead of crashing. */
export function hasPermission(user: Pick<User, 'permissions'>, permission: Permission): boolean {
  return user.permissions?.includes(permission) ?? false;
}

/** The public (no-email) profile in the picker roster. */
export const PublicUser = User.pick({ id: true, username: true, avatarUrl: true, hasPin: true });
export type PublicUser = z.infer<typeof PublicUser>;

/** Public login-gate config. */
export const AuthConfig = z.object({
  publicUserList: z.boolean(),
  hasAccounts: z.boolean(),
});
export type AuthConfig = z.infer<typeof AuthConfig>;

/** `{ token, accessToken, user }` from register/login. */
export const AuthResult = z.object({
  token: z.string(),
  accessToken: z.string(),
  user: User,
});
export type AuthResult = z.infer<typeof AuthResult>;

/** `{ token, user }` from `/auth/token` (session refresh/exchange). */
export const SessionResult = AuthResult.omit({ accessToken: true });
export type SessionResult = z.infer<typeof SessionResult>;

/** One signed-in device from `GET /auth/me/sessions`. `id` is a non-secret
 * handle used to revoke it; `current` marks the device making the request. */
export const SessionInfo = z.object({
  id: SessionId,
  userAgent: z.string().nullish(),
  createdAt: z.string(),
  lastSeen: z.string().nullish(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;

/** One registered passkey from `GET /auth/me/passkeys`. `id` revokes it. */
export const PasskeyInfo = z.object({
  id: PasskeyId,
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

/** The status-tagged union both pairing polls answer with
 * (`/auth/quickconnect/poll`, `/handoff/poll`). `expired` covers an unknown
 * secret too: a device that cannot tell them apart simply starts over. */
export const PairingStatus = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('expired') }),
  AuthResult.extend({ status: z.literal('authorized') }),
]);
export type PairingStatus = z.infer<typeof PairingStatus>;

const Delivery = z.enum(['manual', 'smtp']).catch('manual');

/** `POST /api/admin/users/:id/reset` the link plus the one-time code the owner
 * reads to the user. */
export const ResetCreated = z.object({
  token: z.string(),
  code: z.string(),
  url: z.string().nullable(),
  expiresAt: z.number(),
  delivered: Delivery,
});
export type ResetCreated = z.infer<typeof ResetCreated>;

/** `POST /api/admin/users/:id/email-verification` the verification link. No
 * code: reaching the mailbox is itself the proof. */
export const VerificationCreated = ResetCreated.omit({ code: true });
export type VerificationCreated = z.infer<typeof VerificationCreated>;

/** `GET /api/auth/reset/:token` the public check before the reset form.
 * Reused by `/api/auth/verify-email/:token`, same shape. */
export const ResetCheck = z.object({
  valid: z.boolean(),
  username: z.string().nullish(),
});
export type ResetCheck = z.infer<typeof ResetCheck>;

/** A registration invitation created by a user with `users.manage`. `createdBy`
 * is a nullable display string, not a branded id. */
export const Invite = z.object({
  token: InviteToken,
  permissions: z.array(Permission),
  createdBy: z.string().nullish(),
  createdAt: z.string(),
  expiresAt: z.number(),
  used: z.boolean(),
});
export type Invite = z.infer<typeof Invite>;

/** `POST /api/invites` result the invite plus a ready-to-share join URL. */
export const InviteCreated = Invite.pick({
  token: true,
  permissions: true,
  expiresAt: true,
}).extend({ url: z.string().nullable() });
export type InviteCreated = z.infer<typeof InviteCreated>;

/** A patch of the signed-in account's own profile. Omitted keys are left
 * unchanged; a `null` clears the field (only the language prefs are clearable
 * server-side, username and email must be non-empty). */
export const AccountPatch = User.pick({
  username: true,
  email: true,
  language: true,
  audioLanguage: true,
  subtitleLanguage: true,
}).exactPartial();
export type AccountPatch = z.infer<typeof AccountPatch>;
