import { type StoryMdxModule, storyFromMdx } from '@kroma/workbench';
import type { Story } from '@kroma/workbench/story';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { onScreen } from '#ui/testing';
import { type Access, accessOf } from './a11y';
import { type Cost, costOf } from './cost';
import { signatureOf } from './paint';
import { measured, type Work, workOf } from './work';

interface Measured {
  id: string;
  name: string;
  tier: string;
  file: string;
  view: string;
  cost: Cost;
  /** What the view looks like, leaf by leaf. See `paint.ts`. */
  signature: readonly string[];
  /** What a screen reader gets from it, and what is wrong with that. See
   * `a11y.ts`. */
  access: Access;
  /** What mounting it cost the CPU. See `work.ts`. */
  work: Work;
  error?: string;
}

/** One measured view before the story's file places it in the kit. */
type Measurement = Omit<Measured, 'file' | 'tier'>;

/** A view's name and the element it renders. */
type View = readonly [name: string, ui: () => ReactElement];

const TIERS = ['atoms', 'molecules', 'organisms', 'templates'] as const;

function tierOf(file: string): string {
  return TIERS.find((tier) => file.includes(`/components/${tier}/`)) ?? 'foundations';
}

function found(): readonly [string, Story][] {
  const documents = import.meta.glob('#ui/**/*.story.mdx', { eager: true }) as Record<
    string,
    StoryMdxModule
  >;
  return Object.entries(documents)
    .map(
      ([file, module]) =>
        [file.replace(/^.*\/packages\/ui\//, ''), storyFromMdx(module, file)] as const,
    )
    .sort(([a], [b]) => a.localeCompare(b));
}

/** Every view a story can be measured in: its preview, then each named scene. */
function viewsOf(story: Story): readonly View[] {
  return [
    ['preview', () => story.render(story.args) as ReactElement],
    ...story.scenes.map<View>((scene) => [
      `scene:${scene.name}`,
      () => scene.render(story.args) as ReactElement,
    ]),
  ];
}

/** Everything a component mounted: its own tree plus any portal it opened onto
 * the document, which is where an overlay's DOM actually lands. */
function rootsOf(container: HTMLElement): readonly Element[] {
  const portals = [...document.body.children].filter((child) => child !== container);
  return [...container.children, ...portals];
}

const NO_COST: Cost = {
  nodes: 0,
  leaves: 0,
  overhead: 0,
  depth: 0,
  svg: 0,
  bytes: 0,
  smells: [],
};

// A view that throws is measured as zero and carries the message: a story that
// stopped rendering is a finding, not a gap in the table.
function measure(story: Story, view: string, ui: () => ReactElement): Measurement {
  const common = { id: story.id, name: story.name, view };
  const key = {};
  try {
    const roots = rootsOf(render(measured(key, onScreen(ui()))).container);
    return {
      ...common,
      cost: costOf(roots),
      signature: signatureOf(roots),
      access: accessOf(roots),
      work: workOf(key),
    };
  } catch (error) {
    return {
      ...common,
      cost: NO_COST,
      signature: [],
      access: { lines: [], findings: [] },
      work: { commits: 0, remounts: false },
      error: (error as Error).message.split('\n')[0],
    };
  } finally {
    cleanup();
  }
}

/** Every story view in the kit, measured. `only` keeps the stories whose name or
 * id contains one of the given needles, case-insensitively. */
function measureKit(only: readonly string[] = []): readonly Measured[] {
  const needles = only.map((needle) => needle.toLowerCase());
  const keep = (story: Story) =>
    needles.length === 0 ||
    needles.some((needle) => `${story.name} ${story.id}`.toLowerCase().includes(needle));
  const out: Measured[] = [];
  for (const [file, story] of found()) {
    if (!keep(story)) continue;
    for (const [view, ui] of viewsOf(story)) {
      out.push({ ...measure(story, view, ui), file, tier: tierOf(file) });
    }
  }
  return out;
}

/** One story view, mounted, for a tool that wants to look at the DOM itself
 * rather than at a number. The caller must `cleanup()`. */
function mount(story: Story, view: string): readonly Element[] {
  const wanted = viewsOf(story).find(([name]) => name === view);
  if (!wanted) throw new Error(`no view ${view} on ${story.name}`);
  const [, ui] = wanted;
  return rootsOf(render(onScreen(ui())).container);
}

export type { Measured };
export { found, measureKit, mount, viewsOf };
