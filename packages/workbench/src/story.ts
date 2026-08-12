// The story format: one plain object per component describing how to render it,
// what about it is worth changing, and which of its views actually read that.

import type { VariantSource } from '@kroma/ui/kit';
import { type ComponentType, createElement, type ReactNode } from 'react';
import {
  type Args,
  argControls,
  type ControlSpec,
  type MatrixRow,
  type ResolvedControl,
  variantControls,
} from './derive';
import type { PlayFunction } from './play-types';
import type { PropSection } from './props';
import { slug } from './registry';
import type { View } from './router';

/** How much width the canvas gives a story: a fixed width, the whole stage, or
 * the stage clamped. Omit it for a component sized by its own content. */
type StoryWidth = number | 'fill' | { min?: number; max?: number };

/** A `<story>.docs.mdx` compiled to a component. `components` is the element
 * map the workbench hands it (`MDX_COMPONENTS`); MDX types it loosely because
 * every host maps a different set. */
type DocComponent = ComponentType<{ components?: Record<string, unknown> }>;

/** A story's prose: the inline `docs:` string, or the sibling `.docs.mdx` that
 * replaces it. */
type StoryDocs = string | DocComponent;

type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T;

interface SceneCommon {
  name: string;
  docs?: string;
  play?: PlayFunction;
}

/** One named take on a component, and the two ways to write one. `render` reads
 * the live args, so the controls keep driving it; `example` is a fixed
 * composition, and the controls step aside rather than moving nothing. Writing
 * both is a type error; writing neither reuses the story's own render with the
 * scene's `args` merged in. */
type SceneDef<A extends Args> =
  | (SceneCommon & {
      render?: (args: A) => ReactNode;
      example?: never;
      args?: { [K in keyof A]?: Widen<A[K]> };
    })
  | (SceneCommon & { example: () => ReactNode; render?: never; args?: never });

/** A worked example, written as an ordinary component. Produced by `demos.ts`
 * from the `*.demo.tsx` files beside a component, never authored by hand. */
interface DemoDef {
  name: string;
  docs?: string;
  /** Absent on Metro, which cannot hand a module its own text. */
  code?: string;
  render: () => ReactNode;
}

interface StoryCommon<A extends Args> {
  name: string;
  group: string;
  docs?: string;
  variants?: VariantSource;
  /** Variant groups to leave out of the derived controls, for a recipe that
   *  belongs to a PART while the story renders the Root: the Root cannot take
   *  them, so a control for one moves nothing and reads as broken. */
  omit?: readonly string[];
  controls?: { [K in keyof A]?: ControlSpec };
  scenes?: readonly SceneDef<A>[];
  matrix?: false;
  pad?: number;
  width?: StoryWidth;
  viewport?: 'fit' | 'tv' | 'phone' | 'tablet';
  usage?: string;
  guidelines?: { do?: readonly string[]; dont?: readonly string[] };
  play?: PlayFunction;
}

/** A story, either way round: name the `component` and the workbench renders it
 * with the live args, so a control that moves nothing cannot be written; or
 * write a `render` that composes whatever the component needs around it, and
 * take the args as its argument. */
type StoryDef<A extends Args, P extends object = A> =
  | (StoryCommon<A> & { render: (args: A) => ReactNode; component?: never; args?: A })
  | (StoryCommon<A> & {
      component: ComponentType<P>;
      render?: (args: A) => ReactNode;
      // `A` is inferred FROM `args`, so `A & Partial<P>` alone accepts any key
      // at all: a misspelt prop simply widens `A`. Naming the keys `P` does not
      // have and giving them `never` is what makes the component the authority.
      args?: A & Partial<P> & { [K in Exclude<keyof A, keyof P>]: never };
    });

interface Scene {
  name: string;
  docs?: string;
  live: boolean;
  render: (args: Args) => ReactNode;
  play?: PlayFunction;
}

/** A story after compilation: everything the workbench needs, nothing it has to
 * derive again at render time — including `live`, which says whether the args
 * reach what is on the canvas, because after compilation every render takes one
 * argument whether or not its author read it. */
interface Story {
  id: string;
  name: string;
  group: string;
  tier: string;
  /** Absent until the registry attaches the file the story was discovered at. */
  path?: string;
  docs?: StoryDocs;
  args: Args;
  controls: ResolvedControl[];
  matrix: MatrixRow[];
  scenes: Scene[];
  demos: readonly DemoDef[];
  /** One section per part of a compound component, or one unnamed section for a
   * plain one. Empty on Metro, which has no build-time reader. */
  props: readonly PropSection[];
  render: (args: Args) => ReactNode;
  live: boolean;
  play?: PlayFunction;
  pad: number;
  width?: StoryWidth;
  viewport?: 'fit' | 'tv' | 'phone' | 'tablet';
  usage?: string;
  guidelines: { do: readonly string[]; dont: readonly string[] };
}

interface OwnView<A extends Args> {
  render: (args: A) => ReactNode;
  live: boolean;
}

// The author's own arity, read BEFORE anything wraps it: a compiled render
// always takes the args, so this is the last point at which "reads them" and
// "ignores them" are still two different functions.
function ownView<A extends Args, P extends object>(def: StoryDef<A, P>): OwnView<A> {
  if (def.render) return { render: def.render, live: def.render.length > 0 };
  const component = def.component as ComponentType<Args> | undefined;
  if (!component) return { render: () => null, live: false };
  return { render: (args) => createElement(component, args), live: true };
}

function sceneLive<A extends Args>(scene: SceneDef<A>, own: boolean): boolean {
  if (scene.example) return false;
  if (scene.render) return scene.render.length > 0;
  return own;
}

function sceneRender<A extends Args>(
  scene: SceneDef<A>,
  own: (args: A) => ReactNode,
): (args: Args) => ReactNode {
  const { example, render = own, args } = scene;
  if (example) return example;
  return (current) => render({ ...current, ...args } as unknown as A);
}

function resolveScenes<A extends Args>(scenes: readonly SceneDef<A>[], own: OwnView<A>): Scene[] {
  return scenes.map((scene) => ({
    name: scene.name,
    docs: scene.docs,
    play: scene.play,
    live: sceneLive(scene, own.live),
    render: sceneRender(scene, own.render),
  }));
}

// `const A`: without it `args: { icon: 'volume' }` infers `string` and every
// story feeding a union-typed prop stops compiling.
function story<const A extends Args = Record<string, never>, P extends object = A>(
  def: StoryDef<A, P>,
): Story {
  const variants = variantControls(def.variants, def.omit);

  const args: Args = { ...def.args };
  for (const [group, value] of Object.entries(variants.defaults)) args[group] ??= value;

  const variantKeys = new Set(variants.controls.map((control) => control.key));
  const own = ownView(def);

  return {
    id: slug(def.name),
    name: def.name,
    group: def.group,
    // Overwritten by the registry, the only thing that knows the file path.
    tier: 'Other',
    docs: def.docs,
    args,
    controls: [
      ...variants.controls,
      ...argControls(def.args ?? {}, def.controls ?? {}, variantKeys),
    ],
    matrix: def.matrix === false ? [] : variants.matrix,
    scenes: resolveScenes(def.scenes ?? [], own),
    demos: [],
    props: [],
    render: (current: Args) => own.render(current as unknown as A),
    live: own.live,
    play: def.play,
    pad: def.pad ?? 0,
    width: def.width,
    viewport: def.viewport,
    usage: def.usage,
    guidelines: { do: def.guidelines?.do ?? [], dont: def.guidelines?.dont ?? [] },
  };
}

interface ControlsRole {
  show: boolean;
  reset: boolean;
}

function viewIsLive(story: Story, view: View): boolean {
  if (view.startsWith('demo:')) return false;
  if (!view.startsWith('scene:')) return story.live;
  return story.scenes[Number(view.slice(view.indexOf(':') + 1))]?.live ?? false;
}

/** What the panel's controls can do on the view being shown. A scene that
 * ignores the args, and every demo, is a fixed picture: the controls are hidden
 * rather than left there moving nothing, and Reset with them. */
function controlsRole(story: Story, view: View): ControlsRole {
  const show = viewIsLive(story, view);
  return { show, reset: show && story.controls.length > 0 };
}

export type {
  ControlsRole,
  DemoDef,
  DocComponent,
  Scene,
  SceneDef,
  Story,
  StoryDef,
  StoryDocs,
  StoryWidth,
};
export { controlsRole, story };
