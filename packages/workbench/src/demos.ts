// How a demo file becomes a demo.
//
// A demo is ONE FILE, `<story>.<demo>.demo.tsx`, sitting beside the component:
//
//   components/atoms/button.detail-actions.demo.tsx
//
// Everything the workbench shows about it comes out of that file. The file name
// says which story it belongs to and what the tab is called, the doc comment
// above the default export is the prose, and the FILE ITSELF is the code sample.
//
// That last part is the point of this module. Demos used to carry a hand-written
// copy of their own source in a template literal, and every one of them had
// already drifted from the component beside it: a `signedIn` branch that only
// existed in the real example, a `validate` that only existed in the string. The
// sample cannot drift from the demo when it IS the demo.
//
// Reading a file as text is a bundler primitive, and only one of the two
// bundlers has it: Vite (`?raw`), which covers every web target - the kit site,
// the TV browser shells, the desktop app and the test runner. Metro has no
// equivalent, so on Apple TV and Android TV a demo renders with no code panel
// rather than with a stale one. The name and the prose still work there, because
// those come from the file name and are parsed from a comment when a source is
// available.

import { type ComponentType, createElement } from 'react';
import type { DemoDef, Story } from './story';

/** One discovered file: what the bundler could tell us about it. */
interface DemoFile {
  /** The module path the bundler enumerated it under. Only the basename is read. */
  path: string;
  /** The default export: the example itself, as a component. */
  component: ComponentType;
  /** The file's own text, where the bundler can provide it. */
  source?: string;
}

/** A demo plus the story it belongs to. */
interface DiscoveredDemo extends DemoDef {
  story: string;
}

/** `.../button.detail-actions.demo.tsx` -> `button` + `detail-actions`. The two
 * segments are dot-separated because both halves are themselves kebab-case:
 * `otp-field.pairing-code.demo.tsx` has to split one way only. */
function demoKey(path: string): { story: string; slug: string } {
  const file = path.split('/').pop() ?? path;
  const parts = file.split('.');
  const [story, slug, marker, ext] = parts;
  if (parts.length !== 4 || marker !== 'demo' || ext !== 'tsx' || !story || !slug) {
    throw new Error(
      `Bad demo file name "${file}". A demo is one file named <story>.<demo>.demo.tsx, ` +
        'for instance button.detail-actions.demo.tsx.',
    );
  }
  return { story, slug };
}

/** `detail-actions` -> `Detail actions`. Sentence case, not title case: these are
 * tab labels sitting next to `Preview` and `Matrix`, not headlines. Override it
 * with `@name` where the words need their own capitals or hyphens. */
function titleFrom(slug: string): string {
  const words = slug.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The doc comment that documents the default export: the last block comment
 * with nothing but whitespace between it and `export default`.
 *
 * `(?:(?!\*\/)[\s\S])*` rather than a lazy `[\s\S]*?`, and the difference is the
 * whole point. A lazy match still starts at the LEFTMOST `/**` the engine can
 * begin from, so it only stops at the `*​/` that happens to precede
 * `export default` - which means one earlier block comment anywhere in the file
 * (a header, a note on a helper) swallowed everything between the two. The tab's
 * prose became the file, and `codeFrom` deleted the imports and the helper from
 * the published sample, producing a snippet that does not compile. Forbidding
 * `*​/` inside the body pins the match to the LAST comment instead.
 */
const DOC_ABOVE_EXPORT = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*export default/;

/** A jsdoc tag opening a line: `@name`, `@see`, `@todo`. Matches the tag and the
 * gap after it only - the VALUE is sliced off the line, so nothing here has two
 * ways to consume the same characters. */
const TAG_LINE = /^@(\w+)[^\S\n]*/;

interface DemoMeta {
  docs?: string;
  name?: string;
}

/**
 * The prose and the overrides, out of the doc comment above the default export:
 *
 *   /**
 *    * The row from a title screen: one primary action, then toggles.
 *    *
 *    * (at)name Detail actions
 *    *\/
 *   export default function DetailActions() { ... }
 *
 * The description becomes the tab's paragraph (`**bold**` and `` `code` `` work,
 * as everywhere else in the workbench). `@name` renames the tab. Any other tag
 * is ignored rather than rendered, so a demo can carry `@see` or `@todo` for the
 * next reader without it turning up in the UI.
 */
function metaFrom(source: string | undefined): DemoMeta {
  const block = source?.match(DOC_ABOVE_EXPORT)?.[1];
  if (!block) return {};
  // Each line of a block comment carries the leading ` * ` the formatter puts
  // there; the prose starts after it.
  const lines = block.split('\n').map((line) => line.replace(/^\s*\*/, '').trim());
  const prose: string[] = [];
  let name: string | undefined;
  for (const line of lines) {
    // The tag and its value are matched separately, and the value is taken by
    // slicing rather than by a second capture: `\s*(.*)` lets the whitespace and
    // the value both claim the same spaces, which is backtracking the scanner is
    // right to flag on a line nobody bounds the length of.
    const tag = TAG_LINE.exec(line);
    if (!tag) {
      prose.push(line);
      continue;
    }
    if (tag[1] === 'name') {
      const value = line.slice(tag[0].length).trim();
      if (value) name = value;
    }
  }
  // One paragraph: the panel renders a sentence or two under the tab, and a
  // comment is wrapped at whatever column the formatter chose.
  const docs = prose.join(' ').replace(/\s+/g, ' ').trim();
  return { ...(docs ? { docs } : null), ...(name ? { name } : null) };
}

/** The file as the panel should show it: everything but the doc comment that the
 * panel is already displaying as prose above it. Nothing else is stripped - the
 * imports and the `export default` are part of how the example is really
 * written, and a sample that quietly differs from the file is the thing this
 * whole module exists to stop. */
function codeFrom(source: string | undefined): string | undefined {
  if (!source) return undefined;
  const code = source.replace(DOC_ABOVE_EXPORT, 'export default').trim();
  return code || undefined;
}

/** One file, compiled. */
function demoFrom(file: DemoFile): DiscoveredDemo {
  const { story, slug } = demoKey(file.path);
  const meta = metaFrom(file.source);
  const code = codeFrom(file.source);
  return {
    story,
    name: meta.name ?? titleFrom(slug),
    ...(meta.docs ? { docs: meta.docs } : null),
    ...(code ? { code } : null),
    // MOUNTED, not called: a demo is a component with hooks of its own, and
    // invoking it as a plain function is an invalid hook call.
    render: () => createElement(file.component),
  };
}

/**
 * Hang every discovered demo on the story its file names, and return the stories
 * with their `demos` filled in.
 *
 * Sorted by file path, so the tab order is the same in both bundlers and a
 * `?view=demo:1` link keeps pointing at the same example. A demo naming a story
 * that does not exist is a typo in a file name - loud, because the alternative
 * is an example that silently never appears anywhere.
 */
function attachDemos(stories: readonly Story[], files: readonly DemoFile[]): Story[] {
  const byStory = new Map<string, DemoDef[]>();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const { story, ...demo } = demoFrom(file);
    const list = byStory.get(story);
    if (list) list.push(demo);
    else byStory.set(story, [demo]);
  }
  const known = new Set(stories.map((entry) => entry.id));
  for (const story of byStory.keys()) {
    if (!known.has(story)) {
      throw new Error(
        `Demo file for an unknown story "${story}". The first segment of a demo's ` +
          "file name has to be a story's id (its name, kebab-cased).",
      );
    }
  }
  return stories.map((story) => {
    const demos = byStory.get(story.id);
    return demos ? { ...story, demos } : story;
  });
}

export type { DemoFile, DiscoveredDemo };
export { attachDemos, codeFrom, demoFrom, demoKey, metaFrom, titleFrom };
