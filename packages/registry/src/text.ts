// Two small string operations the contract needs in more than one place, kept
// linear on purpose: both read input someone else supplied.

/** Bytes as base64. `fromCodePoint` over `fromCharCode`: both are exact for the
 *  0..255 range these carry, and only one of them is the one to reach for. */
export function base64(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes));
}

/** A URL path or base with its trailing slashes removed. A loop rather than
 *  `/\/+$/`, which backtracks super-linearly on a long run of slashes. */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}
