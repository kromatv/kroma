// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileMdx } from '@kroma/bundler/mdx';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  const table = /const _components = \{([\s\S]{0,4000}?)\.\.\.props\.components/.exec(
    compiled,
  )?.[1];
  if (!table) throw new Error('MDX emitted no element table: the fixture compiled to nothing.');
  return [...table.matchAll(/(\w{1,64}): "\w{1,64}"/g)].map((pair) => pair[1] as string);
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
    // The lazy run is bounded: unbounded, a fixture that never closes the child
    // makes every start position rescan the rest of the file.
    const outsideCode = compiled.replace(
      /className: "language-\w{1,32}",\s{0,64}children: "[\s\S]{0,8000}?"\n/g,
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

describe('a code fence', () => {
  const Pre = MDX_COMPONENTS.pre;
  const Code = MDX_COMPONENTS.code;

  it('draws the code MDX wrapped in the <code> element below it', () => {
    const { container } = render(
      onScreen(
        <Pre>
          <Code>{'<Box gap={8} />'}</Code>
        </Pre>,
      ),
    );
    expect(container.textContent).toContain('<Box gap={8} />');
  });

  it('draws nothing for a fence with no code in it', () => {
    const { container } = render(
      onScreen(
        <Pre>
          <Code />
        </Pre>,
      ),
    );
    expect(container.textContent?.trim()).toBe('');
  });
});

describe('a link in a doc', () => {
  const Anchor = MDX_COMPONENTS.a;

  it('opens the web schemes a component doc has any reason to name', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(onScreen(<Anchor href="https://kroma.tv">kroma</Anchor>));
    fireEvent.click(screen.getByText('kroma'));
    expect(open).toHaveBeenCalledWith('https://kroma.tv');
    open.mockRestore();
  });

  it('hands the platform nothing else, so prose cannot run a script or read a disk', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    for (const href of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x']) {
      cleanup();
      render(onScreen(<Anchor href={href}>x</Anchor>));
      fireEvent.click(screen.getByText('x'));
    }
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
