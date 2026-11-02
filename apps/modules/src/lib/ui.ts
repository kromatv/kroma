export const mb = (n?: number | null) => {
  if (!n) return '';
  if (n < 1048576) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

/** The first and last eight hex characters, which is how a checksum is compared
 *  by eye. */
export const shortHash = (hash: string) =>
  hash.length > 20 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
