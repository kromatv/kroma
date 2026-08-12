// A story's own source, as the code drawer shows it beside a scene.
//
// There is no source here: this is the data @kroma/bundler's `storyCode` plugin
// cut out of the `*.stories.tsx` at build time. Empty on Metro, which cannot
// hand a module its own text - the same bargain a demo's code panel makes, and
// the same one the prop docs make.

import type { Story } from './story';

/** One story file's authored source: the story's own `render`, and one entry
 * per scene in the order the file declares them. A scene that writes neither
 * `render` nor `example` carries the story's own, which is what renders it. */
interface StoryCode {
  render?: string;
  scenes: readonly string[];
}

/** Every story file's source, keyed by repository-relative path. */
type StoryCodes = Readonly<Record<string, StoryCode>>;

/** The entry for a file a bundler discovered. Vite globs a story as
 * `../../packages/ui/src/…` and Metro as something else again, so the map is
 * asked for each of the path's suffixes until one of them is the repository's
 * own spelling. */
function codeAt(codes: StoryCodes, path: string): StoryCode | undefined {
  for (let at = 0; at <= path.length; ) {
    const hit = codes[path.slice(at)];
    if (hit) return hit;
    const next = path.indexOf('/', at);
    if (next === -1) return undefined;
    at = next + 1;
  }
  return undefined;
}

/** The story with its own source attached, and each scene's. Returned unchanged
 * where the build had nothing to say about the file. */
function withCode(story: Story, code: StoryCode | undefined): Story {
  if (!code) return story;
  const scenes = story.scenes.map((scene, at) => {
    const source = code.scenes[at];
    return source ? { ...scene, code: source } : scene;
  });
  return { ...story, ...(code.render ? { code: code.render } : null), scenes };
}

export type { StoryCodes };
export { codeAt, withCode };
