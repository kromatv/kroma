import { describe, expect, it } from 'vitest';
import { claimedByParts, ownDeclaration } from './props-read';

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
