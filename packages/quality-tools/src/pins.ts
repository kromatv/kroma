import { z } from 'zod';

export const TOOLS = ['crapper', 'dryer', 'mutator'] as const;

const Pin = z.object({
  name: z.enum(TOOLS),
  url: z.string().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
});

export type Pin = z.infer<typeof Pin>;
export type ToolName = Pin['name'];

function parseLine(line: string): Pin {
  const [name, url, commit, ...rest] = line.split(/\s+/);
  const read = Pin.safeParse({ name, url, commit });
  if (!read.success || rest.length > 0) {
    throw new Error(`pins.txt: '${line}' is not 'name url commit'`);
  }
  return read.data;
}

/** One pin per tool, from `name url commit` lines. A malformed line, a missing tool and a tool pinned twice all throw. */
export function parsePins(text: string): Pin[] {
  const pins = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseLine);
  for (const tool of TOOLS) {
    const count = pins.filter((pin) => pin.name === tool).length;
    if (count !== 1) {
      throw new Error(`pins.txt: ${tool} is pinned ${count} times, expected once`);
    }
  }
  return pins;
}
