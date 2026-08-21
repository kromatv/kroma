import { z } from 'zod';

// The canary channel, read in the browser rather than baked in at build time:
// main moves several times a day and this page is prerendered once per deploy.
// Same origin: `/api/*` is the one path the site's Worker answers.

const File = z.object({
  target: z.string().min(1),
  label: z.string().min(1),
  contains: z.array(z.string()).default([]),
  bytes: z.number().int().nonnegative(),
  // No protocol pin: this is the site's own origin, which is http on localhost.
  url: z.url(),
});

const Build = z.object({
  version: z.string().nullish(),
  commit: z.object({ short: z.string().min(1), title: z.string().default('') }),
  run: z.object({ url: z.url({ protocol: /^https$/ }), finishedAt: z.string() }),
  files: z.array(File).min(1),
});

export const Canary = z.object({ builds: z.array(Build).default([]) });

export type CanaryBuild = z.infer<typeof Build>;
export type CanaryFile = z.infer<typeof File>;

const INDEX_URL = '/api/canary/index.json';

// The document is a few kB per build. An answer orders of magnitude larger is
// not what we asked for, and the text is held in memory before it is parsed.
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;

/**
 * The builds `main` has produced, newest first, or an empty list.
 *
 * Never throws: a canary channel that cannot be reached is a section that does
 * not render, not a page that breaks.
 */
export async function fetchCanary(limit = 20): Promise<CanaryBuild[]> {
  try {
    const res = await fetch(`${INDEX_URL}?limit=${limit}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const body = await res.text();
    if (body.length > MAX_BYTES) return [];

    const parsed = Canary.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data.builds : [];
  } catch {
    return [];
  }
}
