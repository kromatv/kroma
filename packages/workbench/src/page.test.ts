import { describe, expect, it } from 'vitest';
import * as themePage from './fixtures/02-making-a-theme.page.mdx';
import { discoverPagesMetro, discoverPagesVite, orderPages, type Page, pageAt } from './page';

const CONTENT = () => null;
const at = (path: string, meta = {}) => pageAt(path, { default: CONTENT, ...meta });

const listed = (pages: readonly Page[]) => pages.map((page) => `${page.group}/${page.title}`);

describe('pageAt', () => {
  it('reads what a page is from where it sits', () => {
    const page = at('/src/guides/making-a-theme.page.mdx');
    expect(page.id).toBe('making-a-theme');
    expect(page.title).toBe('Making a theme');
    expect(page.group).toBe('Guides');
    expect(page.content).toBe(CONTENT);
  });

  it('takes a leading number as the order, not as part of the name', () => {
    const page = at('/src/01-getting-started/02-installing-the-kit.page.mdx');
    expect([page.id, page.title]).toEqual(['installing-the-kit', 'Installing the kit']);
    expect([page.order, page.groupOrder]).toEqual([2, 1]);
    expect(page.group).toBe('Getting started');
  });

  it('lets the document say what its name cannot', () => {
    const page = at('/src/guides/theme.page.mdx', {
      id: 'theming',
      title: 'Theming KROMA',
      group: 'Foundations',
      summary: 'One object of tokens.',
      order: 3,
    });
    expect(page).toMatchObject({
      id: 'theming',
      title: 'Theming KROMA',
      group: 'Foundations',
      summary: 'One object of tokens.',
      order: 3,
    });
  });

  it('files a page with no folder over it under one anyway', () => {
    expect(at('theming.page.mdx').group).toBe('Pages');
  });

  it('keeps a name with no letters in it rather than showing an empty title', () => {
    expect(at('/src/guides/--.page.mdx').title).toBe('--');
  });

  it('refuses the one id that addresses the component tree', () => {
    expect(() => at('/src/guides/story.page.mdx')).toThrow(/"story"/);
  });

  it('refuses a file that is not a page rather than hiding it', () => {
    expect(() => at('/src/guides/making-a-theme.mdx')).toThrow(/\.page\.mdx/);
    expect(() => at('/src/guides/.page.mdx')).toThrow(/\.page\.mdx/);
    expect(() => pageAt('/src/x.page.mdx', { default: 'not a component' } as never)).toThrow(
      /no component/,
    );
  });
});

describe('orderPages', () => {
  it('reads in the order the sections and the pages are numbered', () => {
    const pages = orderPages([
      at('/src/02-guides/02-making-a-theme.page.mdx'),
      at('/src/02-guides/01-installing.page.mdx'),
      at('/src/01-start/what-it-is.page.mdx'),
      at('/src/02-guides/writing-a-story.page.mdx'),
    ]);
    expect(listed(pages)).toEqual([
      'Start/What it is',
      'Guides/Installing',
      'Guides/Making a theme',
      // Unnumbered, so it follows the pages that said where they go.
      'Guides/Writing a story',
    ]);
  });

  it('keeps a section in one piece when a page is filed under it by hand', () => {
    const pages = orderPages([
      at('/src/02-guides/01-making-a-theme.page.mdx'),
      at('/src/09-appendix/tokens.page.mdx', { group: 'Guides', order: 9 }),
      at('/src/03-reference/props.page.mdx'),
    ]);
    expect(listed(pages)).toEqual(['Guides/Making a theme', 'Guides/Tokens', 'Reference/Props']);
  });

  it('falls back to the alphabet, never to the locale', () => {
    const pages = orderPages([
      at('/src/tools/zoom.page.mdx'),
      at('/src/about/why.page.mdx'),
      at('/src/tools/copy.page.mdx'),
    ]);
    expect(listed(pages)).toEqual(['About/Why', 'Tools/Copy', 'Tools/Zoom']);
  });
});

describe('discoverPagesVite', () => {
  const modules = {
    '/src/guides/making-a-theme.page.mdx': { default: CONTENT, order: 2 },
    '/src/guides/installing.page.mdx': { default: CONTENT, order: 1 },
    '/src/components/button.stories.tsx': { default: {} },
    '/src/components/button.docs.mdx': { default: CONTENT },
  };

  it('takes the articles and leaves every other module alone', () => {
    const pages = discoverPagesVite(modules);
    expect(pages.map((page) => page.id)).toEqual(['installing', 'making-a-theme']);
  });

  it('does not depend on the order the bundler enumerated them in', () => {
    const reversed = Object.fromEntries(Object.entries(modules).reverse());
    expect(discoverPagesVite(reversed)).toEqual(discoverPagesVite(modules));
  });

  it('is loud about two pages claiming one id', () => {
    expect(() =>
      discoverPagesVite({
        '/src/guides/theming.page.mdx': { default: CONTENT },
        '/src/foundations/theming.page.mdx': { default: CONTENT },
      }),
    ).toThrow(/both claim the id "theming"/);
  });
});

describe('discoverPagesMetro', () => {
  it('reads the same pages out of a require context', () => {
    const held: Record<string, unknown> = {
      '../guides/installing.page.mdx': { default: CONTENT },
      '../button.stories.tsx': { default: {} },
    };
    const context = Object.assign((id: string) => held[id], { keys: () => Object.keys(held) });
    expect(discoverPagesMetro(context as never).map((page) => page.id)).toEqual(['installing']);
  });
});

// The one thing no unit test of the parser can show: that MDX really does carry
// a document's own `export const` through to the module, on the same compiler
// options both bundlers run.
describe('a compiled .page.mdx', () => {
  it('arrives with the metadata the document declared', () => {
    const page = pageAt('/src/fixtures/02-making-a-theme.page.mdx', themePage);
    expect(page.title).toBe('Making a theme, end to end');
    expect(page.summary).toBe('Three tokens, one function, and the shells that read them.');
    // Neither is exported: the file name and its folder answer for them.
    expect([page.id, page.group, page.order]).toEqual(['making-a-theme', 'Fixtures', 2]);
    expect(typeof page.content).toBe('function');
  });
});
