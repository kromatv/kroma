export const shortHash = (hash: string) =>
  hash.length > 20 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
