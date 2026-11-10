import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const MAX_FILE_CHARS = 1_000_000;

const RememberedSet = z.object({
  host: z.string().min(1).max(255),
  platform: z.string().min(1).max(64),
  name: z.string().max(255),
  model: z.string().max(255),
  package: z.string().min(1).max(255),
  source: z.enum(['local', 'stable', 'canary', 'build']).optional(),
  options: z.record(z.string().max(64), z.union([z.string().max(255), z.boolean()])).optional(),
  installedAt: z.iso.datetime(),
});

const Remembered = z.object({ televisions: z.array(RememberedSet).max(500) });

export type RememberedSet = z.infer<typeof RememberedSet>;

/** Where the sets KROMA was installed on from this computer are kept. */
export const REMEMBERED = join(homedir(), '.kroma', 'televisions.json');

/** The sets remembered, or none when the file is missing or is not one of ours. */
export async function rememberedSets(path = REMEMBERED): Promise<RememberedSet[]> {
  try {
    const text = await readFile(path, 'utf8');
    if (text.length > MAX_FILE_CHARS) return [];
    const parsed = Remembered.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.televisions : [];
  } catch {
    return [];
  }
}

/** Remembers what was installed on a set, in place of what its address held before. */
export async function rememberSet(set: RememberedSet, path = REMEMBERED): Promise<void> {
  const others = (await rememberedSets(path)).filter((known) => known.host !== set.host);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ televisions: [...others, set] }, null, 2)}\n`);
}
