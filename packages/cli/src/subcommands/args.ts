export const dirsArg = {
  type: 'positional',
  required: false,
  description: 'Module directories; default: this module, or every one under modules/',
} as const;

export const serverArgs = {
  server: { type: 'string', valueHint: 'url', description: 'The KROMA server (KROMA_SERVER)' },
  token: { type: 'string', valueHint: 'token', description: 'A session token (KROMA_TOKEN)' },
} as const;

export const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '' ? v : undefined;
export const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  return typeof v === 'string' && v !== '' ? [v] : [];
};
