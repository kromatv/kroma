import { randomBytes } from 'node:crypto';

const BYTES = 24;

/**
 * The password a generated PKCS#12 is locked with. It is written beside the
 * archive rather than chosen by anyone, so nothing has to print it, type it or
 * carry it in a shell history.
 */
export const randomPassword = () => randomBytes(BYTES).toString('base64url');
