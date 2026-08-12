// How a `<story>.docs.mdx` file becomes a story's documentation.
//
// A story's prose is a real MDX file sitting beside the component -
// `list-row.docs.mdx` next to `list-row.stories.tsx` - so it is written with an
// editor's markdown support, read as a document rather than as an escaped
// template literal, and can put the LIVE COMPONENT in the middle of the
// sentence describing it. Discovery is the same trick demos use: the FILE NAME
// says which story it belongs to.
//
// Both bundlers compile it to a component (see packages/bundler's mdx.mjs and
// mdx-transformer.cjs), so unlike a demo's code panel the prose does not thin
// out on a television.

import type { DocComponent, Story } from './story';

/** One discovered `<story>.docs.mdx`: the path the bundler found it at, and the
 * component it compiled to. */
interface DocsFile {
  path: string;
  content: DocComponent;
}

/** `.../list-row.docs.mdx` -> `list-row`, the id of the story it documents. */
function docsKey(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const parts = file.split('.');
  const [story, marker, ext] = parts;
  if (parts.length !== 3 || marker !== 'docs' || ext !== 'mdx' || !story) {
    throw new Error(
      `Bad docs file name "${file}". A story's prose is one file named <story>.docs.mdx, ` +
        'for instance list-row.docs.mdx.',
    );
  }
  return story;
}

/** Give every story that has one its MDX file, which REPLACES the inline
 * `docs:` string: a story carrying both would otherwise show one of them with
 * nothing to say which. A file naming a story that does not exist is a typo in
 * a file name - loud, because the alternative is prose that silently appears
 * nowhere. */
function attachDocs(stories: readonly Story[], files: readonly DocsFile[]): Story[] {
  const byStory = new Map<string, DocComponent>();
  for (const file of files) byStory.set(docsKey(file.path), file.content);
  const known = new Set(stories.map((entry) => entry.id));
  for (const id of byStory.keys()) {
    if (!known.has(id)) {
      throw new Error(
        `Docs file for an unknown story "${id}". The first segment of a .docs.mdx ` +
          "file name has to be a story's id (its name, kebab-cased).",
      );
    }
  }
  return stories.map((story) => {
    const docs = byStory.get(story.id);
    return docs ? { ...story, docs } : story;
  });
}

export type { DocsFile };
export { attachDocs, docsKey };
