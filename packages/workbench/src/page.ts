// A whole `.page.mdx` file shown as an article of its own.
//
// A story's `.docs.mdx` answers "what is this component"; a page answers the
// questions that belong to no component - how to install the kit, how the theme
// is put together, how to write a story. Those are documents, so they are
// written as documents and the workbench shows them whole, beside the stories
// rather than inside one.
//
// What a page IS comes from the file: `guides/02-making-a-theme.page.mdx` is
// the second page of the Guides section, called "Making a theme". A file that
// wants to say otherwise exports it (see `PageMeta`), which MDX carries as
// ordinary ESM - so this works under Vite and Metro alike, with no frontmatter
// plugin on either side.

import { byText, slug } from './registry';
import type { DocComponent } from './story';

/** What a `.page.mdx` may export about itself, over what its own name says.
 * Every field is optional; `export const title = 'Making a theme'` is the whole
 * spelling. */
interface PageMeta {
  id?: string;
  title?: string;
  group?: string;
  /** One line under the title. */
  summary?: string;
  /** Position within the group, low first. A `NN-` prefix on the file name says
   *  the same thing without an export; a page with neither comes last. */
  order?: number;
  /** How much of the canvas the article takes. `reading` (the default) caps the
   *  column where a line of prose stops being comfortable; `wide` suits a page
   *  whose figures carry the argument; `full` is for one that is mostly a
   *  component, like a browsable grid. */
  width?: PageWidth;
}

type PageWidth = 'reading' | 'wide' | 'full';

/** A compiled `.page.mdx`: MDX's default export, plus whatever the document
 * declared about itself. */
type PageModule = PageMeta & { default: DocComponent };

interface Page {
  id: string;
  title: string;
  group: string;
  summary?: string;
  order?: number;
  groupOrder?: number;
  width?: PageWidth;
  path: string;
  content: DocComponent;
}

const PAGE = '.page.mdx';

const RESERVED_ID = 'story';

// `02-making-a-theme` - the number orders the file and is not part of its name.
// The same prefix on the folder orders the section.
const NUMBERED = /^(\d{1,3})[-_.](.+)$/;

function numbered(segment: string): { order?: number; name: string } {
  const at = NUMBERED.exec(segment);
  if (!at?.[1] || !at[2]) return { name: segment };
  return { order: Number(at[1]), name: at[2] };
}

// Sentence case, which is the voice the rest of the workbench is written in.
// Null for a name with nothing in it, so a caller can fall back.
function titleOf(name: string): string | null {
  const words = name.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : null;
}

// Where a page with no folder over it goes.
const UNFILED = 'Pages';

/** One discovered page. Throws on a file this is not: a page that silently
 * appears nowhere is worse than a build that stops. */
function pageAt(path: string, module: PageModule): Page {
  const file = path.split('/').pop() as string;
  const base = file.endsWith(PAGE) ? file.slice(0, -PAGE.length) : '';
  if (!base) {
    throw new Error(
      `Bad page file name "${file}". An article is one file named <name>.page.mdx, ` +
        'for instance making-a-theme.page.mdx.',
    );
  }
  if (typeof module.default !== 'function') {
    throw new TypeError(`"${file}" compiled to no component. A page is an .mdx document.`);
  }
  const own = numbered(base);
  const section = numbered(path.split('/').at(-2) ?? '');
  const id = module.id ?? slug(own.name);
  // An article is addressed at the root, so `story` is the one id the router
  // reads as something else and could never reach.
  if (id === RESERVED_ID) {
    throw new Error(
      `"${file}" claims the id "${RESERVED_ID}", which addresses the component tree.`,
    );
  }
  return {
    id,
    title: module.title ?? titleOf(own.name) ?? own.name,
    // A page with no folder over it still needs a section to sit in.
    group: module.group ?? titleOf(section.name) ?? UNFILED,
    summary: module.summary,
    order: module.order ?? own.order,
    width: module.width,
    groupOrder: section.order,
    path,
    content: module.default,
  };
}

const LAST = Number.MAX_SAFE_INTEGER;

/** Reading order: sections first, then the pages inside one. */
function orderPages(pages: readonly Page[]): Page[] {
  // A section ranks by the earliest number any of its pages carries, so it
  // stays in one piece even where a page exports a group its folder never named.
  const rank = new Map<string, number>();
  for (const page of pages) {
    rank.set(page.group, Math.min(rank.get(page.group) ?? LAST, page.groupOrder ?? LAST));
  }
  const of = (page: Page) => rank.get(page.group) as number;
  return [...pages].sort(
    (a, b) =>
      of(a) - of(b) ||
      byText(a.group, b.group) ||
      (a.order ?? LAST) - (b.order ?? LAST) ||
      byText(a.title, b.title),
  );
}

function assemble(found: readonly Page[]): readonly Page[] {
  const seen = new Set<string>();
  for (const page of found) {
    if (seen.has(page.id)) {
      throw new Error(
        `Two pages both claim the id "${page.id}" (${page.path}). A page's id is its file ` +
          'name, so two files of the same name in different folders need one to export its own.',
      );
    }
    seen.add(page.id);
  }
  return orderPages(found);
}

// Sorted before anything reads them, so a bundler's enumeration order cannot
// change what a section looks like.
function pagePaths(paths: readonly string[]): string[] {
  return paths.filter((path) => path.endsWith(PAGE)).sort(byText);
}

/** The articles in Vite's glob. Give it the same `import.meta.glob` the stories
 * come from, or one of its own: anything that is not a `.page.mdx` is ignored. */
function discoverPagesVite(modules: Record<string, unknown>): readonly Page[] {
  return assemble(
    pagePaths(Object.keys(modules)).map((path) => pageAt(path, modules[path] as PageModule)),
  );
}

/** The articles in Metro's context. MDX compiles to a component on both
 * bundlers, so an article is whole on a television. */
function discoverPagesMetro(context: { keys(): string[]; <T>(id: string): T }): readonly Page[] {
  return assemble(pagePaths(context.keys()).map((path) => pageAt(path, context<PageModule>(path))));
}

export type { Page, PageMeta, PageModule, PageWidth };
export { discoverPagesMetro, discoverPagesVite, orderPages, pageAt };
