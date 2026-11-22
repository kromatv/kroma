import { z } from 'zod';
import { Permission, User } from '../accounts';
import { LibraryId } from '../media';

/** Where the invitation of an account that waits stands: one is `pending`, the
 * last one `expired`, or there is `none` to redeem. */
export const InvitationState = z.enum(['pending', 'expired', 'none']);
export type InvitationState = z.infer<typeof InvitationState>;

/** One account in the admin "Membres & partage" table carries email, a derived
 * role, last-activity and a live `online` flag. `resetRequested` marks a user
 * who asked for a credential reset from the sign-in screen and for whom the
 * owner has not minted one since. `libraries` is the grant: the library ids this
 * account may see, or `null` for every library.
 *
 * `invitation` is set for an account that waits on an invitation: nobody has
 * signed in to it yet, and nobody can until its invitation is redeemed. `kids`
 * marks a Kids profile, which nobody signs in to at all. Only these two have
 * no `email`. */
export const AdminUser = User.pick({
  id: true,
  username: true,
  avatarUrl: true,
  hasPin: true,
  createdAt: true,
}).extend({
  email: z.string().nullable(),
  invitation: InvitationState.nullish(),
  permissions: z.array(Permission),
  libraries: z.array(LibraryId).nullable(),
  role: z.string(),
  lastSeen: z.string().nullish(),
  online: z.boolean(),
  emailVerified: z.boolean(),
  resetRequested: z.boolean(),
  kids: z.boolean().default(false),
});
export type AdminUser = z.infer<typeof AdminUser>;

/** `POST /api/admin/kids`: a Kids profile's name, one of the kids levels with
 * none picked in advance, and its grant (`null` for every library). */
export const NewKidsProfile = z.object({
  username: z.string().trim().nonempty(),
  level: z.union([z.literal(0), z.literal(7), z.literal(10)]),
  libraries: z.array(LibraryId).nullable(),
});
export type NewKidsProfile = z.infer<typeof NewKidsProfile>;

/** `GET /api/admin/users`. */
export const AdminUsers = z.object({
  users: z.array(AdminUser),
  libraryCount: z.number(),
});
export type AdminUsers = z.infer<typeof AdminUsers>;

/** `PATCH /api/admin/users/:id` body. An omitted `libraries` leaves the grant
 * alone; `null` grants every library, a list grants exactly those. */
export const AdminUserPatch = AdminUser.pick({
  permissions: true,
  username: true,
  libraries: true,
}).exactPartial();
export type AdminUserPatch = z.infer<typeof AdminUserPatch>;

/** `GET /api/admin/stats/overview`. */
export const AdminOverview = z.object({
  users: z.number(),
  online: z.number(),
  invites: z.number(),
  items: z.number(),
  shows: z.number(),
  libraries: z.number(),
});
export type AdminOverview = z.infer<typeof AdminOverview>;

/** One entry of the admin's server-side folder picker. */
export const AdminFsEntry = z.object({
  name: z.string(),
  path: z.string(),
});
export type AdminFsEntry = z.infer<typeof AdminFsEntry>;

/** `GET /api/admin/libraries/browse`. `parent` is null at a root. */
export const AdminFsList = z.object({
  path: z.string(),
  parent: z.string().nullable(),
  entries: z.array(AdminFsEntry),
});
export type AdminFsList = z.infer<typeof AdminFsList>;
