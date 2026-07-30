// The rules that turn a file into a demo: its name, its doc comment, its source.
//
// Worth testing on their own because they are the whole authoring contract. A
// demo file declares nothing, so a mistake here is not a type error - it is a
// tab with the wrong title, or an example that never appears.

import { describe, expect, it } from 'vitest';
import { attachDemos, codeFrom, demoFrom, demoKey, metaFrom, titleFrom } from './demos';
import { type Story, story } from './story';

const SOURCE = `import { Box } from './box';
import { Button } from './button';

/**
 * The row from a title screen: one primary action, then two toggles.
 * Press them to see the amber \`active\` fill.
 *
 * @name Detail actions
 * @see button.stories.tsx
 */
export default function DetailActions() {
  return <Box />;
}
`;

const noop = () => null;

describe('demoKey', () => {
  it('splits a story from a demo, both kebab-case', () => {
    expect(demoKey('../ui/molecules/otp-field.pairing-code.demo.tsx')).toEqual({
      story: 'otp-field',
      slug: 'pairing-code',
    });
  });

  it('rejects a name that does not say which story it belongs to', () => {
    expect(() => demoKey('./button.demo.tsx')).toThrow(/one file named/);
    expect(() => demoKey('./button.detail-actions.demos.tsx')).toThrow(/one file named/);
  });
});

describe('titleFrom', () => {
  it('reads a slug as a sentence, not as a headline', () => {
    expect(titleFrom('detail-actions')).toBe('Detail actions');
    expect(titleFrom('verify')).toBe('Verify');
  });
});

describe('metaFrom', () => {
  it('takes the prose as one paragraph and honours @name', () => {
    expect(metaFrom(SOURCE)).toEqual({
      docs: 'The row from a title screen: one primary action, then two toggles. Press them to see the amber `active` fill.',
      name: 'Detail actions',
    });
  });

  it('ignores a comment that documents something else', () => {
    expect(metaFrom('/** A helper. */\nfunction help() {}\nexport default help;')).toEqual({});
  });

  it('has nothing to say about a file whose source is unavailable', () => {
    expect(metaFrom(undefined)).toEqual({});
  });
});

describe('codeFrom', () => {
  it('drops the doc comment the panel already shows, and keeps the rest', () => {
    const code = codeFrom(SOURCE) ?? '';
    expect(code).toContain("import { Box } from './box';");
    expect(code).toContain('export default function DetailActions()');
    // The prose and its tags are rendered above the sample, not inside it.
    expect(code).not.toContain('@name');
    expect(code).not.toContain('The row from a title screen');
  });

  it('is absent where the bundler cannot read the file', () => {
    expect(codeFrom(undefined)).toBeUndefined();
  });
});

describe('demoFrom', () => {
  it('names a demo from its file when the comment does not', () => {
    const demo = demoFrom({ path: 'a/chip.filter-row.demo.tsx', component: noop });
    expect(demo).toMatchObject({ story: 'chip', name: 'Filter row' });
    expect(demo.code).toBeUndefined();
  });
});

describe('attachDemos', () => {
  const stories: Story[] = [
    story({ name: 'Button', group: 'Actions', render: () => null }),
    story({ name: 'Chip', group: 'Actions', render: () => null }),
  ];

  it('hangs each demo on the story its file names, in path order', () => {
    const [button, chip] = attachDemos(stories, [
      { path: 'z/button.destructive-pair.demo.tsx', component: noop },
      { path: 'a/button.detail-actions.demo.tsx', component: noop },
    ]);
    expect(button?.demos.map((entry) => entry.name)).toEqual([
      'Detail actions',
      'Destructive pair',
    ]);
    expect(chip?.demos).toEqual([]);
  });

  it('refuses a demo for a story that does not exist', () => {
    expect(() =>
      attachDemos(stories, [{ path: 'a/buton.typo.demo.tsx', component: noop }]),
    ).toThrow(/unknown story "buton"/);
  });
});

// The doc comment above `export default` is the LAST one, not the first the
// regex engine can start from - a file header or a note on a helper would
// otherwise swallow everything between the two.
describe('a demo with an earlier block comment', () => {
  const SOURCE = `import { Button } from '@kroma/ui/kit';

/** Reject an empty email. */
function validate(email: string) {
  return email.length > 0;
}

/**
 * The sign-in form.
 * @name Sign in
 */
export default function SignInForm() {
  return <Button label="Go" onPress={() => validate('')} />;
}
`;

  it('reads only the comment that documents the export', () => {
    expect(metaFrom(SOURCE)).toEqual({ docs: 'The sign-in form.', name: 'Sign in' });
  });

  it('leaves the imports and the helper in the code sample', () => {
    const code = codeFrom(SOURCE) ?? '';
    expect(code).toContain("import { Button } from '@kroma/ui/kit';");
    expect(code).toContain('function validate');
    // Only the export's own doc comment is taken out.
    expect(code).toContain('/** Reject an empty email. */');
    expect(code).not.toContain('@name');
  });
});
