import { readFile, writeFile } from 'node:fs/promises';

const ENTRY_SCRIPT = /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/;
const LINK = /<link\b[^>]*>/g;
const LOW = /\sfetchPriority="low"/i;

/** The prerendered shell with its entry script preloaded at high priority. The
 *  router marks every route preload `fetchPriority="low"`, the entry included,
 *  and the entry is the one script no page can render without. */
export function raiseEntryPreload(html: string): string {
  const entry = ENTRY_SCRIPT.exec(html)?.[1];
  if (!entry) return html;
  return html.replace(LINK, (tag) =>
    tag.includes('rel="modulepreload"') && tag.includes(`href="${entry}"`)
      ? tag.replace(LOW, ' fetchPriority="high"')
      : tag,
  );
}

if (import.meta.main) {
  const [file = 'dist/client/_shell.html'] = process.argv.slice(2);
  await writeFile(file, raiseEntryPreload(await readFile(file, 'utf8')));
}
