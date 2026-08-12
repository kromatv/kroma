import { describe, expect, it, vi } from 'vitest';
import type { StoryEntry } from './entry';
import { indexVite, type Loaders, nameFromPath } from './lazy';
import type { PropDoc } from './props';
import { story } from './story';
import type { StoryCodes } from './story-code';

const BUTTON = 'src/components/atoms/button/button.stories.tsx';
const LIST_ROW = 'src/components/molecules/list-row/list-row.stories.tsx';
const DEMO = 'src/components/atoms/button/button.detail-actions.demo.tsx';
const OTHER_DEMO = 'src/components/atoms/button/button.arrangements.demo.tsx';
const DOCS = 'src/components/atoms/button/button.docs.mdx';

const demoComponent = () => null;

const CODES: StoryCodes = {
  [BUTTON]: { name: 'Button', group: 'Actions', render: '<Button label="Play" />', scenes: [] },
  [LIST_ROW]: { name: 'ListRow', group: 'Layout', scenes: [] },
};

const modules = (): Loaders => ({
  [LIST_ROW]: () =>
    Promise.resolve({ default: story({ name: 'ListRow', group: 'Layout', render: () => null }) }),
  [DEMO]: () => Promise.resolve({ default: demoComponent }),
  [BUTTON]: () =>
    Promise.resolve({
      default: story({ name: 'Button', group: 'Actions', docs: 'Inline.', render: () => null }),
    }),
  'src/components/atoms/button/button.tsx': () => Promise.resolve({ default: demoComponent }),
});

const tone: PropDoc = { name: 'tone', type: 'Tone', optional: true };

// The index is ordered exactly as `discoverVite` orders a registry: by
// functional section, and GROUP_ORDER puts Layout ahead of Actions. So ListRow
// leads and Button follows, whatever the paths say.
const AT_BUTTON = 1;

// The index is ordered, so a test naming a position means it.
function entryAt(index: readonly StoryEntry[], at: number): StoryEntry {
  const entry = index[at];
  if (!entry) throw new Error(`the index holds nothing at ${at}`);
  return entry;
}

describe('the index, before anything is fetched', () => {
  it('lists every story, and only the story files', () => {
    expect(indexVite({ modules: modules(), codes: CODES }).map((entry) => entry.id)).toEqual([
      'list-row',
      'button',
    ]);
  });

  it('names and files each one from what the build read, which no path spells', () => {
    const index = indexVite({ modules: modules(), codes: CODES });
    expect(index.map((entry) => `${entry.name}/${entry.group}`)).toEqual([
      'ListRow/Layout',
      'Button/Actions',
    ]);
  });

  it('reads each story’s atomic level out of the path it was found at', () => {
    const index = indexVite({ modules: modules(), codes: CODES });
    expect(index.map((entry) => entry.tier)).toEqual(['Molecules', 'Atoms']);
  });

  it('keeps the file each story was found at, which is what the source link reads', () => {
    const index = indexVite({ modules: modules(), codes: CODES });
    expect(index.map((entry) => entry.path)).toEqual([LIST_ROW, BUTTON]);
  });

  it('holds no story at all until one is asked for', () => {
    const loaders = modules();
    const button = vi.fn(loaders[BUTTON] as () => Promise<unknown>);
    const index = indexVite({ modules: { ...loaders, [BUTTON]: button }, codes: CODES });
    expect(index).toHaveLength(2);
    expect(button).not.toHaveBeenCalled();
    expect(entryAt(index, AT_BUTTON).ready()).toBeUndefined();
  });

  // A build whose reader failed ships an empty map rather than failing the
  // build, and a workbench with no sections at all would be worse than one with
  // the wrong sections.
  it('falls back to the file name, so every deep link survives an unread build', () => {
    const index = indexVite({ modules: modules() });
    expect(index.map((entry) => `${entry.id} ${entry.name} ${entry.group}`)).toEqual([
      'button Button Other',
      'list-row ListRow Other',
    ]);
  });

  it('orders an index exactly as `discoverVite` orders a registry', () => {
    const index = indexVite({ modules: modules(), codes: CODES });
    expect(index.map((entry) => entry.group)).toEqual(['Layout', 'Actions']);
  });

  it('refuses a demo naming a story that does not exist, rather than hiding it', () => {
    const loaders = modules();
    loaders['src/components/atoms/button/buton.typo.demo.tsx'] = () =>
      Promise.resolve({ default: demoComponent });
    expect(() => indexVite({ modules: loaders, codes: CODES })).toThrow(/unknown story "buton"/);
  });
});

describe('a story, once it is asked for', () => {
  it('compiles with the prose, the demos and the props of its own file', async () => {
    const loaders = modules();
    loaders[DOCS] = () => Promise.resolve({ default: demoComponent });
    loaders[OTHER_DEMO] = () => Promise.resolve({ default: demoComponent });
    const index = indexVite({
      modules: loaders,
      sources: { [DEMO]: () => Promise.resolve('export default function Demo() {}') },
      codes: CODES,
      props: () => Promise.resolve({ Button: [tone] }),
    });
    const ready = await entryAt(index, AT_BUTTON).load();

    expect(ready.docs).toBe(demoComponent);
    expect(ready.demos.map((demo) => demo.name)).toEqual(['Arrangements', 'Detail actions']);
    expect(ready.demos[1]?.code).toBe('export default function Demo() {}');
    expect(ready.props).toEqual([{ props: [tone] }]);
    expect(ready.code).toBe('<Button label="Play" />');
    expect(ready.tier).toBe('Atoms');
    expect(ready.path).toBe(BUTTON);
  });

  it('leaves a story with no .docs.mdx on the string it declares', async () => {
    const index = indexVite({ modules: modules(), codes: CODES });
    expect((await entryAt(index, AT_BUTTON).load()).docs).toBe('Inline.');
  });

  it('fetches a module again after one attempt failed, rather than keeping the failure', async () => {
    const loaders = modules();
    const good = loaders[BUTTON] as () => Promise<unknown>;
    const button = vi
      .fn(good)
      .mockImplementationOnce(() => Promise.reject(new Error('chunk gone')));
    const index = indexVite({ modules: { ...loaders, [BUTTON]: button }, codes: CODES });
    const entry = entryAt(index, AT_BUTTON);

    await expect(entry.load()).rejects.toThrow('chunk gone');
    expect(entry.ready()).toBeUndefined();
    expect((await entry.load()).name).toBe('Button');
    expect(button).toHaveBeenCalledTimes(2);
  });

  it('fetches a module once, however many views ask for it', async () => {
    const loaders = modules();
    const button = vi.fn(loaders[BUTTON] as () => Promise<unknown>);
    const index = indexVite({ modules: { ...loaders, [BUTTON]: button }, codes: CODES });
    const entry = entryAt(index, AT_BUTTON);
    const [first, second] = await Promise.all([entry.load(), entry.load()]);
    await entry.load();

    expect(button).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(entry.ready()).toBe(first);
  });
});

describe('nameFromPath', () => {
  it('reads the component a file is named after, whose slug is that name again', () => {
    expect(nameFromPath('a/b/list-row/list-row.stories.tsx')).toBe('ListRow');
    expect(nameFromPath('a/colors.stories.tsx')).toBe('Colors');
  });
});
