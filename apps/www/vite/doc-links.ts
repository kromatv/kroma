import { posix } from 'node:path';

/** Where the setup guides live in the repository, relative to its root. */
export const DOCS_DIR = 'docs/setup';

/** Whether a compiled file is a guide: an English one under `docs/setup`, or
 *  a translation under the site's `content/docs`. */
export function isDocFile(path: string | undefined): boolean {
  if (!path) return false;
  const normalized = path.replaceAll('\\', '/');
  return normalized.includes(`/${DOCS_DIR}/`) || normalized.includes('/content/docs/');
}

const ABSOLUTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i;
const GUIDE = new RegExp(String.raw`^${DOCS_DIR}/([\w-]+)\.md$`);

/** A guide's link, as the site serves it. A link between guides becomes a
 *  `/docs` route, any other repository path a GitHub URL. Relative links
 *  resolve against `docs/setup` whichever file holds them, so a translation
 *  links exactly like the English guide it was written from. */
export function rewriteDocUrl(url: string, repoUrl: string): string {
  if (ABSOLUTE.test(url)) return url;
  const hashAt = url.indexOf('#');
  const path = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const resolved = posix.normalize(posix.join(DOCS_DIR, path)).replace(/\/$/, '');
  if (resolved.startsWith('..')) return url;
  if (resolved === DOCS_DIR) return `/docs${hash}`;
  const guide = GUIDE.exec(resolved);
  if (guide) return guide[1] === 'README' ? `/docs${hash}` : `/docs/${guide[1]}${hash}`;
  return `${repoUrl}/blob/main/${resolved}${hash}`;
}

interface LinkNode {
  type: string;
  url?: string;
  children?: LinkNode[];
}

function visit(node: LinkNode, fn: (node: LinkNode) => void) {
  fn(node);
  for (const child of node.children ?? []) visit(child, fn);
}

/** Rewrites every link and link definition of a guide with `rewriteDocUrl`. */
export function remarkDocLinks(options: { repoUrl: string }) {
  return (tree: LinkNode, file: { path?: string }) => {
    if (!isDocFile(file.path)) return;
    visit(tree, (node) => {
      if ((node.type === 'link' || node.type === 'definition') && node.url !== undefined) {
        node.url = rewriteDocUrl(node.url, options.repoUrl);
      }
    });
  };
}
