import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readStoryCode, type StoryCodes } from './story-code-read';

const LIST_ROW = `import { story } from '@kroma/workbench/story';

export default story({
  name: 'ListRow',
  group: 'Layout',
  args: { icon: 'settings', label: 'Language' },
  render: ({ icon, label }) => (
    <Box minW={320}>
      <ListRow.Root icon={icon}>
        <ListRow.Label>{label}</ListRow.Label>
      </ListRow.Root>
    </Box>
  ),
  scenes: [
    { name: 'Merged args', args: { icon: 'language' } },
    {
      name: 'A list',
      render: ({ icon }) => (
        <Box gap={10}>
          <ListRow.Root icon={icon} />
        </Box>
      ),
    },
    {
      name: 'Media at the head',
      example: () => (
        <Box gap={10}>
          <ListRow.Root>
            <ListRow.Leading>
              <Avatar name="Maxime" circle />
            </ListRow.Leading>
            <ListRow.Label>Maxime</ListRow.Label>
          </ListRow.Root>
        </Box>
      ),
    },
  ],
});
`;

const CHIP = `import { story } from '@kroma/workbench/story';

export default story({ name: 'Chip', group: 'Actions', component: Chip, args: { label: 'HDR' } });
`;

const SWATCHES = `import { story } from '@kroma/workbench/story';

export default story({
  name: 'Colors',
  group: 'Foundations',
  render: () => {
    const tokens = Object.keys(PALETTE);
    return <Swatches tokens={tokens} />;
  },
});
`;

// A story assembled out of pieces rather than written whole: a spread instead of
// a member, and a scene list the file computes.
const BADGE = `import { story } from '@kroma/workbench/story';

export default story({
  ...shared,
  name: 'Badge',
  render: () => <Badge label="New" />,
  scenes: [...MORE],
});
`;

const REEXPORT = `import { Chip } from './chip';

export default Chip;
`;

const INDIRECT = `import { story } from '@kroma/workbench/story';
import { config } from './config';

export default story(config);
`;

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    target: 'ES2022',
    module: 'ESNext',
    jsx: 'react-jsx',
    noEmit: true,
    types: [],
  },
  include: ['src'],
});

let repo = '';
let codes: StoryCodes = {};

const LIST_ROW_KEY = 'src/list-row/list-row.stories.tsx';

beforeAll(async () => {
  repo = mkdtempSync(join(tmpdir(), 'kroma-story-code-'));
  mkdirSync(join(repo, 'src', 'list-row'), { recursive: true });
  writeFileSync(join(repo, 'tsconfig.json'), TSCONFIG);
  writeFileSync(join(repo, LIST_ROW_KEY), LIST_ROW);
  writeFileSync(join(repo, 'src', 'chip.stories.tsx'), CHIP);
  writeFileSync(join(repo, 'src', 'colors.stories.tsx'), SWATCHES);
  writeFileSync(join(repo, 'src', 'badge.stories.tsx'), BADGE);
  writeFileSync(join(repo, 'src', 'reexport.stories.tsx'), REEXPORT);
  writeFileSync(join(repo, 'src', 'indirect.stories.tsx'), INDIRECT);
  codes = await readStoryCode({
    tsconfig: join(repo, 'tsconfig.json'),
    repo,
    include: (file) => file.endsWith('.stories.tsx'),
  });
});

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
  repo = '';
});

describe('readStoryCode', () => {
  it('keys a story by the path the repository spells it with', () => {
    expect(Object.keys(codes)).toContain(LIST_ROW_KEY);
  });

  it('keeps the story’s own render whole, at the left margin', () => {
    expect(codes[LIST_ROW_KEY]?.render).toBe(
      [
        '({ icon, label }) => (',
        '  <Box minW={320}>',
        '    <ListRow.Root icon={icon}>',
        '      <ListRow.Label>{label}</ListRow.Label>',
        '    </ListRow.Root>',
        '  </Box>',
        ')',
      ].join('\n'),
    );
  });

  it('unwraps an `example`, whose arrow binds nothing a reader needs', () => {
    const scene = codes[LIST_ROW_KEY]?.scenes[2];
    expect(scene?.startsWith('<Box gap={10}>')).toBe(true);
    expect(scene).toContain('  <ListRow.Root>');
    expect(scene?.endsWith('</Box>')).toBe(true);
  });

  it('keeps a scene’s render whole: its parameter is where the controls reach', () => {
    expect(codes[LIST_ROW_KEY]?.scenes[1]).toBe(
      [
        '({ icon }) => (',
        '  <Box gap={10}>',
        '    <ListRow.Root icon={icon} />',
        '  </Box>',
        ')',
      ].join('\n'),
    );
  });

  it('gives a scene that writes neither the story’s own render, which is what draws it', () => {
    expect(codes[LIST_ROW_KEY]?.scenes[0]).toBe(codes[LIST_ROW_KEY]?.render);
  });

  it('reads the identity a story declares, which no path spells', () => {
    expect(codes[LIST_ROW_KEY]?.name).toBe('ListRow');
    expect(codes[LIST_ROW_KEY]?.group).toBe('Layout');
  });

  it('has no render for a story that names a component, but still has its identity', () => {
    expect(codes['src/chip.stories.tsx']?.render).toBeUndefined();
    expect(codes['src/chip.stories.tsx']?.name).toBe('Chip');
    expect(codes['src/chip.stories.tsx']?.group).toBe('Actions');
  });

  it('reads a name written past a spread, which is not the first member', () => {
    expect(codes['src/badge.stories.tsx']?.name).toBe('Badge');
    expect(codes['src/badge.stories.tsx']?.group).toBeUndefined();
  });

  it('reads past a member that is not written as `name: value`', () => {
    expect(codes['src/badge.stories.tsx']?.render).toBe('<Badge label="New" />');
  });

  it('has no source to show for a scene the file computes rather than writes', () => {
    expect(codes['src/badge.stories.tsx']?.scenes).toEqual(['']);
  });

  it('leaves out a default export that is not a `story(…)` call at all', () => {
    expect(codes['src/reexport.stories.tsx']).toBeUndefined();
  });

  it('leaves out a story whose configuration is written somewhere else', () => {
    expect(codes['src/indirect.stories.tsx']).toBeUndefined();
  });

  it('keeps a block-bodied render whole rather than unwrapping a statement list', () => {
    expect(codes['src/colors.stories.tsx']?.render).toBe(
      [
        '() => {',
        '  const tokens = Object.keys(PALETTE);',
        '  return <Swatches tokens={tokens} />;',
        '}',
      ].join('\n'),
    );
  });
});
