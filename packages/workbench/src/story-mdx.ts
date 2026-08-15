// A `.story.mdx`, compiled to a Story.
//
// The module arrives with the document as its default export, its typed
// declaration as `story` (see `defineStory`), and the scenes the compiler
// lifted out of the prose as `__scenes` (@kroma/bundler's story-scenes.mjs).
// All the derivation - the controls, the matrix, whether the args reach the
// canvas - is story.ts's, so the two authoring formats cannot drift while both
// exist.

import type { ReactNode } from 'react';
import type { Args } from './derive';
import { nameFromPath } from './registry';
import {
  type DocComponent,
  type MdxStoryDeclaration,
  type SceneDef,
  type Story,
  type StoryDef,
  story,
} from './story';

interface LiftedScene {
  name: string;
  args?: Args;
  render?: (args: Args) => ReactNode;
  example?: () => ReactNode;
  code?: string;
}

/** What a compiled `.story.mdx` module exports. */
interface StoryMdxModule {
  default: DocComponent;
  story: MdxStoryDeclaration;
  __scenes?: readonly LiftedScene[];
  /** The declaration's own `render` source, lifted at compile time. */
  __code?: string;
}

/** The suffix a story written as a document answers to. */
const STORY_MDX = '.story.mdx';

// MDX is not typechecked, so the mistake TypeScript would have caught in a
// `story()` call - a scene setting an arg the story does not have - is caught
// here instead, against the args and variant groups the story actually resolved
// to. Every story is compiled by the kit's smoke test, so a typo fails CI
// rather than silently moving nothing on the canvas.
function checkSceneArgs(name: string, compiled: Story, scenes: readonly LiftedScene[]): void {
  const known = new Set([...Object.keys(compiled.args), ...compiled.controls.map((c) => c.key)]);
  if (known.size === 0) return;
  for (const scene of scenes) {
    for (const key of Object.keys(scene.args ?? {})) {
      if (known.has(key)) continue;
      throw new Error(
        `${name}: scene "${scene.name}" sets an arg the story has no control for: \`${key}\`. ` +
          `It knows ${[...known].sort((a, b) => a.localeCompare(b)).join(', ')}.`,
      );
    }
  }
}

/** The story a `.story.mdx` module declares, in the same compiled shape a
 * `story()` call produces: the document is its docs, the lifted scenes its
 * scenes, each still carrying the source it was written as. The name falls
 * back to what the file at `path` implies. */
function storyFromMdx(module: StoryMdxModule, path?: string): Story {
  const declared = module.story;
  const name = declared?.name ?? (path ? nameFromPath(path, STORY_MDX) : undefined);
  if (!name || !declared?.group) {
    throw new Error(
      'A .story.mdx declares itself with `export const story = defineStory({ group, ... })`.',
    );
  }
  const { matrix, ...def } = declared;
  const lifted = module.__scenes ?? [];
  const compiled = story({
    ...def,
    name,
    matrix: matrix === true ? undefined : false,
    scenes: lifted.map(({ code, ...scene }) => scene as SceneDef<Args>),
  } as StoryDef<Args>);
  checkSceneArgs(name, compiled, lifted);
  return {
    ...compiled,
    docs: module.default,
    ...(module.__code ? { code: module.__code } : null),
    scenes: compiled.scenes.map((scene, at) => {
      const code = lifted[at]?.code ?? module.__code;
      return code ? { ...scene, code } : scene;
    }),
  };
}

export type { StoryMdxModule };
export { STORY_MDX, storyFromMdx };
