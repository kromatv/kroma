import { describe, expect, it } from 'vitest';
import { type Context, discoverMetro, discoverVite, type Modules } from './discover';
import type { PropDoc } from './props';

const BUTTON = 'src/components/atoms/button/button.story.mdx';
const CARD = 'src/components/molecules/card/card.story.mdx';
const DEMO = 'src/components/atoms/button/button.detail-actions.demo.tsx';
const OTHER_DEMO = 'src/components/atoms/button/button.arrangements.demo.tsx';

const demoComponent = () => null;
const buttonDoc = () => null;
const cardDoc = () => null;

// A compiled `.story.mdx` arrives as the module itself, not under `default`:
// discovery reads `story`, `__scenes` and the document straight off it.
const modules = (): Modules => ({
  [CARD]: { default: cardDoc, story: { group: 'Input', render: () => null } } as never,
  [DEMO]: { default: demoComponent },
  [BUTTON]: { default: buttonDoc, story: { group: 'Actions', render: () => null } } as never,
  'src/components/atoms/button/button.tsx': { default: demoComponent },
});

const tone: PropDoc = { name: 'tone', type: 'Tone', optional: true };

describe('discoverVite', () => {
  it('takes only the story files, in a bundler-independent order', () => {
    const stories = discoverVite(modules());
    expect(stories.map((s) => s.id)).toEqual(['button', 'card']);
  });

  it('names each story from its file, unless the declaration says otherwise', () => {
    const found = modules();
    found[CARD] = {
      default: cardDoc,
      story: { name: 'Icônes', group: 'Input', render: () => null },
    } as never;
    expect(discoverVite(found).map((s) => s.name)).toEqual(['Button', 'Icônes']);
  });

  it('reads each story’s atomic level out of the path it was found at', () => {
    const stories = discoverVite(modules());
    expect(stories.map((s) => s.tier)).toEqual(['Atoms', 'Molecules']);
  });

  it('keeps the file each story was found at, which is what the source link reads', () => {
    const stories = discoverVite(modules());
    expect(stories.map((s) => s.path)).toEqual([BUTTON, CARD]);
  });

  it('documents a component’s props by matching the story name', () => {
    const stories = discoverVite(modules(), {}, { Button: [tone], Slider: [tone] });
    expect(stories.find((s) => s.id === 'button')?.props).toEqual([{ props: [tone] }]);
    expect(stories.find((s) => s.id === 'card')?.props).toEqual([]);
  });

  it('documents a compound component part by part', () => {
    const props = { 'Card.Root': [tone], 'Card.Media': [tone] };
    const card = discoverVite(modules(), {}, props).find((s) => s.id === 'card');
    expect(card?.props).toEqual([
      { part: 'Root', props: [tone] },
      { part: 'Media', props: [tone] },
    ]);
  });

  it('ignores an empty prop list rather than replacing the story’s own', () => {
    const stories = discoverVite(modules(), {}, { Button: [] });
    expect(stories.find((s) => s.id === 'button')?.props).toEqual([]);
  });

  it('hangs a demo on the story its file names, with the file itself as the sample', () => {
    const source = '/** Two actions in a row. */\nexport default function Demo() {}\n';
    const stories = discoverVite(modules(), { [DEMO]: source });
    const button = stories.find((s) => s.id === 'button');
    expect(button?.demos).toHaveLength(1);
    expect(button?.demos[0]?.name).toBe('Detail actions');
    expect(button?.demos[0]?.docs).toBe('Two actions in a row.');
    expect(button?.demos[0]?.code).toBe('export default function Demo() {}');
  });

  it('orders demos by path, not by the order the bundler enumerated them', () => {
    const found = modules();
    found[OTHER_DEMO] = { default: demoComponent };
    const button = discoverVite(found).find((s) => s.id === 'button');
    expect(button?.demos.map((d) => d.name)).toEqual(['Arrangements', 'Detail actions']);
  });

  it('refuses a demo naming a story that does not exist, rather than hiding it', () => {
    const found = modules();
    found['src/components/atoms/button/buton.typo.demo.tsx'] = { default: demoComponent };
    expect(() => discoverVite(found)).toThrow(/unknown story "buton"/);
  });

  it('gives a story the source the compiler embedded in its own module', () => {
    const found = modules();
    found[BUTTON] = {
      default: buttonDoc,
      story: { group: 'Actions', render: () => null },
      __code: '<Button label="Play" />',
    } as never;
    expect(discoverVite(found).find((s) => s.id === 'button')?.code).toBe(
      '<Button label="Play" />',
    );
  });

  it('carries the document as the story’s docs', () => {
    expect(discoverVite(modules()).find((s) => s.id === 'button')?.docs).toBe(buttonDoc);
  });
});

describe('discoverMetro', () => {
  const context = (): Context => {
    const found = modules();
    const load = (id: string) => found[id];
    return Object.assign(load as Context, { keys: () => Object.keys(found) });
  };

  it('finds the same stories through Metro’s context', () => {
    expect(discoverMetro(context()).map((s) => s.id)).toEqual(['button', 'card']);
  });

  it('keeps the file each story was found at, in Metro’s own spelling', () => {
    expect(discoverMetro(context()).map((s) => s.path)).toEqual([BUTTON, CARD]);
  });

  it('mounts the demos but leaves them without a code sample', () => {
    const button = discoverMetro(context()).find((s) => s.id === 'button');
    expect(button?.demos[0]?.name).toBe('Detail actions');
    expect(button?.demos[0]?.code).toBeUndefined();
    expect(button?.props).toEqual([]);
  });

  // A `.mdx` compiles to a component under Metro too (mdx-transformer.cjs), so
  // the prose is whole here rather than thinning out the way a demo's code does.
  it('carries the document through Metro’s context untouched', () => {
    expect(discoverMetro(context()).find((s) => s.id === 'button')?.docs).toBe(buttonDoc);
  });
});
