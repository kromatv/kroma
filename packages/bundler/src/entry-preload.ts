const ENTRY_SCRIPT = /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/;
const LINK = /<link\b[^>]*>/g;
const LOW = /\sfetchPriority="low"/i;

/** A built page with its entry script preloaded at high priority. TanStack
 *  Router marks every route preload `fetchPriority="low"`, the entry included,
 *  and the entry is the one script no page can render without. A page with no
 *  module entry comes back unchanged. */
export function raiseEntryPreload(html: string): string {
  const entry = ENTRY_SCRIPT.exec(html)?.[1];
  if (!entry) return html;
  return html.replace(LINK, (tag) =>
    tag.includes('rel="modulepreload"') && tag.includes(`href="${entry}"`)
      ? tag.replace(LOW, ' fetchPriority="high"')
      : tag,
  );
}
