import { z } from 'zod';

/** The account as the server answers it, read for its language and kept whole
 *  for the session a shell boots from. */
export const AccountUser = z.looseObject({ language: z.string().nullish() });
export type AccountUser = z.infer<typeof AccountUser>;

/** What `/auth/login` answers, read for the device token. */
export const LoginAnswer = z.looseObject({ accessToken: z.string().nonempty() });

/** What `/auth/token` answers: a session token and the account. */
export const SessionAnswer = z.looseObject({ token: z.string().nonempty(), user: AccountUser });

/** What `PATCH /auth/me` answers. */
export const MeAnswer = z.looseObject({ user: AccountUser });

/** A movie or a show as a list answers it, read for its title and kept whole
 *  for the TV route that opens it. */
export const Titled = z.looseObject({ title: z.string() });
export type Titled = z.infer<typeof Titled>;

/** Where the kit's reader says a component sits, in viewport pixels. */
export const ReaderBox = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type ReaderBox = z.infer<typeof ReaderBox>;

/** How many pixels of a text the reader says its box cuts, across and down. */
export const ReaderClip = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type ReaderClip = z.infer<typeof ReaderClip>;
