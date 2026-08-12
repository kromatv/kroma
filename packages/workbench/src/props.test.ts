import { describe, expect, it } from 'vitest';
import { type PropDoc, type PropDocs, propCount, propSections } from './props';

const prop = (name: string): PropDoc => ({ name, type: 'string', optional: true });

const DIALOG: PropDocs = {
  Button: [prop('label')],
  'Dialog.Root': [prop('open')],
  'Dialog.Header': [prop('children')],
  'Dialog.Panel': [prop('children')],
  'Dialog.Footer': [prop('children')],
  'Dialog.Actions': [prop('onConfirm')],
};

describe('propSections', () => {
  it('gives a plain component one section with no part to name', () => {
    expect(propSections('Button', DIALOG)).toEqual([{ props: [prop('label')] }]);
  });

  it('gives a compound one a section per part, in the order the map carries', () => {
    expect(propSections('Dialog', DIALOG).map((section) => section.part)).toEqual([
      'Root',
      'Header',
      'Panel',
      'Footer',
      'Actions',
    ]);
  });

  it('leaves a story nothing documented rather than guessing', () => {
    expect(propSections('Chip', DIALOG)).toEqual([]);
  });

  it('is empty under Metro, which populates no docs at all', () => {
    expect(propSections('Dialog', {})).toEqual([]);
  });

  it('splits no name: ListRowProps documents a <ListRow>, not the Root of a <List>', () => {
    const docs: PropDocs = { ListRow: [prop('label')], ListRowRoot: [prop('divider')] };
    expect(propSections('ListRow', docs)).toEqual([{ props: [prop('label')] }]);
    expect(propSections('List', docs)).toEqual([]);
  });

  it('takes only the parts under the dot, not the name that merely starts the same', () => {
    const docs: PropDocs = { 'ListRow.Root': [prop('divider')], 'List.Root': [prop('gap')] };
    expect(propSections('List', docs)).toEqual([{ part: 'Root', props: [prop('gap')] }]);
  });

  it('documents a component with parts by its parts alone', () => {
    const docs: PropDocs = { Dialog: [prop('legacy')], 'Dialog.Root': [prop('open')] };
    expect(propSections('Dialog', docs)).toEqual([{ part: 'Root', props: [prop('open')] }]);
  });

  it('skips a part that documents nothing, and falls back when they all do', () => {
    const docs: PropDocs = { Menu: [prop('label')], 'Menu.Root': [], 'Menu.Item': [prop('icon')] };
    expect(propSections('Menu', docs)).toEqual([{ part: 'Item', props: [prop('icon')] }]);
    expect(propSections('Menu', { Menu: [prop('label')], 'Menu.Root': [] })).toEqual([
      { props: [prop('label')] },
    ]);
  });
});

describe('propCount', () => {
  it('counts every prop across the parts, which is what the tab badge shows', () => {
    expect(propCount(propSections('Dialog', DIALOG))).toBe(5);
    expect(propCount([])).toBe(0);
  });
});
