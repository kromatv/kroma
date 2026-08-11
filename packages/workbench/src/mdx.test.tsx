// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileMdx } from '@kroma/bundler/mdx';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Markdown } from './docs';
import KitchenSink from './kitchen-sink.fixture.mdx';
import { MDX_COMPONENTS, MdxDoc } from './mdx';

afterEach(cleanup);

// From the runner's root: under jsdom `import.meta.url` is an http URL, not a
// file one.
const FIXTURE = join(process.cwd(), 'packages/workbench/src/kitchen-sink.fixture.mdx');

// Which elements MDX decided to emit, read off a real compile of the fixture
// rather than typed out here: MDX writes them as an object of `name: "name"`
// pairs it then spreads the caller's `components` over, and that object IS the
// list of intrinsics this document reaches for.
async function elementsOf(path: string): Promise<string[]> {
  const compiled = await compileMdx(readFileSync(path, 'utf8'), path);
  const table = /const _components = \{([\s\S]*?)\.\.\.props\.components/.exec(compiled)?.[1];
  if (!table) throw new Error('MDX emitted no element table: the fixture compiled to nothing.');
  return [...table.matchAll(/(\w+): "\w+"/g)].map((pair) => pair[1] as string);
}

// Everything mdast-util-to-hast plus GFM can produce. The derived list above is
// the real gate; this one is the floor, so an element the fixture stops
// exercising is still caught.
const EMITTABLE = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'input',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'strong',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

describe('the element map', () => {
  it('covers every element the fixture actually compiles to', async () => {
    const emitted = await elementsOf(FIXTURE);
    // The fixture is the input to the gate: a document that exercised three
    // constructs would pass vacuously.
    expect(emitted.length).toBeGreaterThanOrEqual(EMITTABLE.length);
    expect(emitted.filter((name) => !(name in MDX_COMPONENTS))).toEqual([]);
  });

  it('covers every element MDX can emit at all', () => {
    expect(EMITTABLE.filter((name) => !(name in MDX_COMPONENTS))).toEqual([]);
  });

  it('maps nothing MDX does not emit, so a name cannot rot here unnoticed', () => {
    expect(Object.keys(MDX_COMPONENTS).filter((name) => !EMITTABLE.includes(name))).toEqual([]);
  });
});

// The elements above are the ones React Native has no renderer for: any of them
// reaching the tree is a crash on a television, and silently fine in a browser.
// So the assertion is made where a browser would have let it through.
describe('rendering a compiled document', () => {
  it('puts no HTML element in the tree: every one went through the map', () => {
    const { container } = render(onScreen(<MdxDoc content={KitchenSink} />));
    // `img` is not in the sweep: the kit's own <Img> paints a real <img> on the
    // web (and a React Native <Image> on a television), so finding one here says
    // nothing about whether MDX's element was mapped. The two tests above are
    // what gate it.
    const html = EMITTABLE.filter((name) => name !== 'img').join(',');
    expect([...container.querySelectorAll(html)].map((el) => el.tagName)).toEqual([]);
  });

  it('draws the prose, the live component and the code block', () => {
    const { container } = render(onScreen(<MdxDoc content={KitchenSink} />));
    const text = container.textContent ?? '';
    expect(text).toContain('Heading one');
    expect(text).toContain('struck out');
    expect(text).toContain('the second');
    expect(text).toContain('<Box gap={8} />');
  });

  // Every newline hast keeps is a bug waiting on a television: between blocks a
  // string child of a view is an outright error, and inside a paragraph a soft
  // wrap is a hard line break rather than the space a browser collapses it to.
  // The rehype pass in @kroma/bundler's mdx.mjs is what settles both.
  it('carries no newline outside a code block', async () => {
    const compiled = await compileMdx(readFileSync(FIXTURE, 'utf8'), FIXTURE);
    const outsideCode = compiled.replace(
      /className: "language-\w+",\s*children: "[\s\S]*?"\n/g,
      '',
    );
    expect(outsideCode).not.toContain('\\n');
  });

  it('reads a soft-wrapped paragraph as one line', () => {
    const { container } = render(onScreen(<MdxDoc content={KitchenSink} />));
    expect(container.textContent).toContain('an inline image');
  });
});

// The other spelling: the 71 stories that say what they are for in a string.
// It goes through the same components, so it has the same guarantee.
describe('an inline docs string', () => {
  const SOURCE = [
    '## A heading',
    '',
    'A paragraph with **bold**, `code` and a [link](https://kroma.tv).',
    '',
    '- one item',
    '- another',
    '',
    '```tsx',
    '<Button label="Play" />',
    '```',
  ].join('\n');

  it('renders through the element map, so it puts no HTML in the tree either', () => {
    const { container } = render(onScreen(<Markdown>{SOURCE}</Markdown>));
    const html = EMITTABLE.filter((name) => name !== 'img').join(',');
    expect([...container.querySelectorAll(html)].map((el) => el.tagName)).toEqual([]);
    const text = container.textContent ?? '';
    expect(text).toContain('A heading');
    expect(text).toContain('another');
    expect(text).toContain('<Button label="Play" />');
  });
});
