import { describe, expect, it } from 'vitest';
import { attachDocs, docsKey } from './prose';
import { type Story, story } from './story';

const stories = (): Story[] => [
  story({ name: 'ListRow', group: 'Input', docs: 'Written in the story.', render: () => null }),
  story({ name: 'Card', group: 'Layout', render: () => null }),
];

const PATH = 'src/components/molecules/list-row/list-row.docs.mdx';
const compiled = () => null;

describe('docsKey', () => {
  it('reads the story id off the file name', () => {
    expect(docsKey(PATH)).toBe('list-row');
  });

  it('refuses a name that is not <story>.docs.mdx', () => {
    expect(() => docsKey('src/list-row.mdx')).toThrow(/one file named <story>\.docs\.mdx/);
    expect(() => docsKey('src/list-row.doc.mdx')).toThrow(/one file named <story>\.docs\.mdx/);
  });
});

describe('attachDocs', () => {
  it('lets the file replace the string written in the story', () => {
    const [row] = attachDocs(stories(), [{ path: PATH, content: compiled }]);
    expect(row?.docs).toBe(compiled);
  });

  it('leaves a story with no file on its own inline docs', () => {
    const found = attachDocs(stories(), []);
    expect(found[0]?.docs).toBe('Written in the story.');
    expect(found[1]?.docs).toBeUndefined();
  });

  it('refuses a docs file naming a story that does not exist', () => {
    expect(() =>
      attachDocs(stories(), [{ path: 'src/lst-row.docs.mdx', content: compiled }]),
    ).toThrow(/unknown story "lst-row"/);
  });
});
