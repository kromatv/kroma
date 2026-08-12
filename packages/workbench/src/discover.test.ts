import { describe, expect, it } from 'vitest';
import { type Context, discoverMetro, discoverVite, type Modules } from './discover';
import type { PropDoc } from './props';
import { story } from './story';

const BUTTON = 'src/components/atoms/button/button.stories.tsx';
const CARD = 'src/components/molecules/card/card.stories.tsx';
const DEMO = 'src/components/atoms/button/button.detail-actions.demo.tsx';
const OTHER_DEMO = 'src/components/atoms/button/button.arrangements.demo.tsx';
const DOCS = 'src/components/atoms/button/button.docs.mdx';

const demoComponent = () => null;

const modules = (): Modules => ({
  [CARD]: { default: story({ name: 'Card', group: 'Input', render: () => null }) },
  [DEMO]: { default: demoComponent },
  [BUTTON]: {
    default: story({ name: 'Button', group: 'Actions', docs: 'Inline.', render: () => null }),
  },
  'src/components/atoms/button/button.tsx': { default: demoComponent },
});

const tone: PropDoc = { name: 'tone', type: 'Tone', optional: true };

describe('discoverVite', () => {
  it('takes only the story files, in a bundler-independent order', () => {
    const stories = discoverVite(modules());
    expect(stories.map((s) => s.id)).toEqual(['button', 'card']);
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

  it('keeps an already-ascending enumeration in exactly that order', () => {
    const found: Modules = {
      [BUTTON]: { default: story({ name: 'Button', group: 'Actions', render: () => null }) },
      [CARD]: { default: story({ name: 'Card', group: 'Input', render: () => null }) },
    };
    expect(discoverVite(found).map((s) => s.tier)).toEqual(['Atoms', 'Molecules']);
  });

  it('refuses a demo naming a story that does not exist, rather than hiding it', () => {
    const found = modules();
    found['src/components/atoms/button/buton.typo.demo.tsx'] = { default: demoComponent };
    expect(() => discoverVite(found)).toThrow(/unknown story "buton"/);
  });

  it('gives a story the JSX a build read out of its own file', () => {
    const codes = { [BUTTON]: { render: '<Button label="Play" />', scenes: [] } };
    expect(discoverVite(modules(), {}, {}, codes).find((s) => s.id === 'button')?.code).toBe(
      '<Button label="Play" />',
    );
  });

  it('takes a story’s prose from the sibling .docs.mdx the module glob found', () => {
    const found = modules();
    found[DOCS] = { default: demoComponent };
    expect(discoverVite(found).find((s) => s.id === 'button')?.docs).toBe(demoComponent);
  });

  it('leaves a story with no .docs.mdx on the string it declares', () => {
    expect(discoverVite(modules()).find((s) => s.id === 'button')?.docs).toBe('Inline.');
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
    expect(button?.code).toBeUndefined();
  });

  // A `.mdx` compiles to a component under Metro too (mdx-transformer.cjs), so
  // the prose is whole here rather than thinning out the way a demo's code does.
  it('takes a story’s prose from the .docs.mdx module the context carries', () => {
    const found = modules();
    found[DOCS] = { default: demoComponent };
    const load = (id: string) => found[id];
    const withDocs = Object.assign(load as Context, { keys: () => Object.keys(found) });
    expect(discoverMetro(withDocs).find((s) => s.id === 'button')?.docs).toBe(demoComponent);
  });
});
