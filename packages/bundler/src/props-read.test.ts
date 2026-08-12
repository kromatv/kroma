import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimedByParts, ownDeclaration, type PropDocs, readPropDocs } from './props-read';

const UI = '/repo/packages/ui/src/components';

describe('ownDeclaration', () => {
  it('keeps a prop the kit declares, wherever in the kit that is', () => {
    expect(ownDeclaration(`${UI}/atoms/text-field/text-field.tsx`)).toBe(true);
    expect(ownDeclaration('/repo/packages/ui/src/core/shorthands.ts')).toBe(true);
    expect(ownDeclaration('/repo/packages/ui/src/lib/field-shell.ts')).toBe(true);
  });

  it('drops one reached by extending a platform type', () => {
    expect(ownDeclaration('/repo/node_modules/react-native-tvos/types/public/ViewProps.d.ts')).toBe(
      false,
    );
    expect(ownDeclaration('/repo/node_modules/@types/react/index.d.ts')).toBe(false);
    expect(
      ownDeclaration('/repo/node_modules/.bun/react-native@0.0.0/node_modules/x/index.d.ts'),
    ).toBe(false);
  });

  it('is not fooled by a path that merely mentions the word', () => {
    expect(ownDeclaration(`${UI}/molecules/node_modules_probe.tsx`)).toBe(true);
  });
});

describe('claimedByParts', () => {
  it('claims the flat name each part is written as', () => {
    const claimed = claimedByParts([
      { name: 'Field', parts: [{ name: 'Root' }, { name: 'Input' }, { name: 'Textarea' }] },
      { name: 'Dialog', parts: [{ name: 'Root' }, { name: 'Actions' }] },
    ]);
    expect([...claimed].sort()).toEqual([
      'DialogActions',
      'DialogRoot',
      'FieldInput',
      'FieldRoot',
      'FieldTextarea',
    ]);
  });

  it('claims nothing for a part whose component has a name of its own', () => {
    // `ListRow.Group` renders a <ListGroup>, so the flat `ListGroup` entry is a
    // component in its own right and is left alone.
    const claimed = claimedByParts([{ name: 'ListRow', parts: [{ name: 'Group' }] }]);
    expect(claimed.has('ListGroup')).toBe(false);
    expect(claimed.has('ListRowGroup')).toBe(true);
  });

  it('claims nothing at all without a namespace', () => {
    expect(claimedByParts([]).size).toBe(0);
  });
});

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    noEmit: true,
    types: [],
  },
  include: ['src'],
});

// A dependency, so its props are reached by extending a declaration that is not
// ours - which is the whole rule `ownDeclaration` exists for.
const PLATFORM = `
export interface PlatformProps {
  onPointerEnterCapture?: () => void;
}
`;

const CHIP = `
import type { PlatformProps } from 'fake-native';

type Tone = 'plain' | 'accent';

export interface ChipProps extends PlatformProps {
  /** The words on the chip. */
  label: string;
  /**
   * How loud it is.
   * @default 'plain'
   */
  tone?: Tone;
  count: number;
}

export const Chip = (props: ChipProps) => props.label;
`;

const FIELD = `
interface FieldRootProps {
  label: string;
}
const FieldRoot = (props: FieldRootProps) => props.label;

interface FieldInputProps {
  placeholder?: string;
}
const FieldInput = (props: FieldInputProps) => props.placeholder;

export const Field = { Root: FieldRoot, Input: FieldInput };
`;

const EMPTY = `
export interface NothingProps {}
export const Nothing = (props: NothingProps) => props;
`;

// Everything a scan meets that is capitalised, or ends in Props, and is still
// not a component.
const NOT_COMPONENTS = `
const SURFACE_LABEL = { bg: 'Page', surface1: 'Card' };
const Sizes = { Small: 12, Large: 20 };
const Pair = { Root: 1 }, Other = { Root: 2 };
export interface Props { anonymous: string }
export const tables = [SURFACE_LABEL, Sizes, Pair, Other];
`;

let project = '';
let docs: PropDocs = {};

beforeAll(async () => {
  project = mkdtempSync(join(tmpdir(), 'kroma-props-read-'));
  const dependency = join(project, 'node_modules', 'fake-native');
  mkdirSync(join(project, 'src'));
  mkdirSync(dependency, { recursive: true });
  writeFileSync(join(project, 'tsconfig.json'), TSCONFIG);
  writeFileSync(
    join(dependency, 'package.json'),
    JSON.stringify({ name: 'fake-native', version: '1.0.0', types: 'index.d.ts' }),
  );
  writeFileSync(join(dependency, 'index.d.ts'), PLATFORM);
  writeFileSync(join(project, 'src', 'chip.ts'), CHIP);
  writeFileSync(join(project, 'src', 'field.ts'), FIELD);
  writeFileSync(join(project, 'src', 'nothing.ts'), EMPTY);
  writeFileSync(join(project, 'src', 'not-components.ts'), NOT_COMPONENTS);
  docs = await readPropDocs(join(project, 'tsconfig.json'), (file) => file.includes('/src/'));
}, 60_000);

afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true });
});

describe('readPropDocs', () => {
  it('names a component after its `*Props` interface', () => {
    expect(Object.keys(docs)).toContain('Chip');
  });

  it('reads a prop as it was WRITTEN, not as the checker resolves it', () => {
    // `tone?: Tone` must not come back as `'plain' | 'accent'`: the alias is what
    // the author wrote, and on <Button icon> the resolved form is a 6215-member
    // union of every glyph.
    const tone = docs.Chip?.find((prop) => prop.name === 'tone');
    expect(tone).toMatchObject({ type: 'Tone', optional: true });
  });

  it('carries the prop’s own sentence, and drops the tag lines under it', () => {
    expect(docs.Chip?.find((prop) => prop.name === 'label')?.docs).toBe('The words on the chip.');
    expect(docs.Chip?.find((prop) => prop.name === 'tone')?.docs).toBe('How loud it is.');
  });

  it('marks a required prop required', () => {
    expect(docs.Chip?.find((prop) => prop.name === 'count')).toMatchObject({
      type: 'number',
      optional: false,
    });
  });

  it('leaves out a prop reached by extending a file the scan does not own', () => {
    expect(docs.Chip?.map((prop) => prop.name)).not.toContain('onPointerEnterCapture');
  });

  it('documents a compound component by its parts', () => {
    expect(docs['Field.Root']?.map((prop) => prop.name)).toEqual(['label']);
    expect(docs['Field.Input']?.map((prop) => prop.name)).toEqual(['placeholder']);
  });

  it('drops the flat entry a part already claims', () => {
    // `FieldRootProps` and `Field.Root` are the same component twice, and the
    // panel only ever reads the part.
    expect(docs).not.toHaveProperty('FieldRoot');
    expect(docs).not.toHaveProperty('FieldInput');
  });

  it('leaves out a component whose props document nothing', () => {
    expect(docs).not.toHaveProperty('Nothing');
  });

  it('reads a lookup table as the lookup table it is', () => {
    // Capitalised object literals are everywhere in a design system; only one
    // whose every value is a component is a namespace.
    expect(Object.keys(docs)).not.toContain('SURFACE_LABEL');
    expect(Object.keys(docs)).not.toContain('Sizes');
    // Two declarations in one statement is not the shape a namespace is written
    // in either.
    expect(Object.keys(docs)).not.toContain('Pair');
    expect(Object.keys(docs)).not.toContain('Other');
  });

  it('names nothing after a bare `Props` interface', () => {
    expect(Object.keys(docs)).not.toContain('');
  });
});
