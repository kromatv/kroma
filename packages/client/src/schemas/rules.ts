// Shared field-validation rules for client-side feedback. They mirror the
// server's checks in `server/src/api/accounts.rs`, which stays the authority.

import { z } from 'zod';

export const emailRule = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'auth.emailInvalid' }));

export const passwordRule = z.string().min(4, { message: 'auth.passwordTooShort' });

export const usernameRule = z.string().trim().min(1, { message: 'auth.usernameInvalid' });

export const pinRule = z.string().regex(/^\d{4}$/, { message: 'auth.pinInvalid' });

const passes = (rule: z.ZodType) => (s: string) => rule.safeParse(s).success;
export const isEmail = passes(emailRule);
export const isPassword = passes(passwordRule);
export const isUsername = passes(usernameRule);
export const isPin = passes(pinRule);
