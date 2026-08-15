// A story's identity, as @kroma/bundler's `storyCode` plugin read it out of the
// `*.story.mdx` at build time. This is what lets an index list the library
// without executing it; a story's source itself travels inside its own module
// (see story-scenes.mjs), so there is nothing else to carry here.

/** What the build read out of one story file: the `name` and `group` a
 * workbench lists it by - unlike its level, no path spells them. */
interface StoryCode {
  name?: string;
  group?: string;
}

/** Every story file's identity, keyed by repository-relative path. */
type StoryCodes = Readonly<Record<string, StoryCode>>;

/** The entry for a file a bundler discovered. Vite globs a story as
 * `../../packages/ui/src/…` and Metro as something else again, so the map is
 * asked for each of the path's suffixes until one of them is the repository's
 * own spelling. */
function codeAt(codes: StoryCodes, path: string): StoryCode | undefined {
  let at = 0;
  for (;;) {
    const hit = codes[path.slice(at)];
    if (hit) return hit;
    const next = path.indexOf('/', at);
    if (next === -1) return undefined;
    at = next + 1;
  }
}

export type { StoryCode, StoryCodes };
export { codeAt };
