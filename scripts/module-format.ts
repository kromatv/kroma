// Shared helpers for the module authoring scripts (gen / new / validate).

// Kept identical to `modules/module.schema.json`'s `id` pattern.
export const REVERSE_DNS = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;

export type Manifest = Record<string, unknown>;

/** The YAML frontmatter of a `.module.md`, or null if it has none. */
export function frontmatter(md: string): Manifest | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  return m ? (Bun.YAML.parse(m[1]) as Manifest) : null;
}

/** A fenced code block's contents by language, or null. `lang` is regex-escaped
 *  and both fences are anchored to a line start, so an indented nested fence
 *  does not truncate the block. */
export function fenced(md: string, lang: string): string | null {
  const escaped = lang.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const re = new RegExp(`^\`\`\`${escaped}[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n\`\`\`[ \\t]*$`, 'm');
  const m = re.exec(md);
  return m ? m[1] : null;
}

/** A reverse-DNS id as a crate / package / path slug. */
export function slug(id: string): string {
  return id
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
