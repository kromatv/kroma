// @vitest-environment jsdom

import { onScreen } from '@kroma/ui/testing';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as themePage from './fixtures/02-making-a-theme.page.mdx';
import { layoutFor } from './layout';
import { pageAt } from './page';
import { PageView } from './page-view';

afterEach(cleanup);

const PAGE = pageAt('/src/fixtures/02-making-a-theme.page.mdx', themePage);

function show(window: [number, number] = [1440, 900]) {
  render(onScreen(<PageView page={PAGE} layout={layoutFor(window[0], window[1])} />));
}

describe('PageView', () => {
  it('leads with what the article is and which section it belongs to', () => {
    show();
    expect(screen.getByText('Making a theme, end to end')).toBeTruthy();
    expect(screen.getByText('Fixtures')).toBeTruthy();
    expect(
      screen.getByText('Three tokens, one function, and the shells that read them.'),
    ).toBeTruthy();
  });

  it('renders the whole document, not a summary of it', () => {
    show();
    // The body's own heading, a sentence of prose, a fenced sample and a table
    // cell: everything a guide is made of, through the kit's element map. The
    // sample is asserted one token at a time, because the highlighter draws it
    // that way.
    expect(screen.getByText('Making a theme')).toBeTruthy();
    expect(screen.getByText(/A theme is a plain object of tokens/)).toBeTruthy();
    expect(screen.getAllByText('setTheme').length).toBeGreaterThan(0);
    expect(screen.getByText('the one thing to notice')).toBeTruthy();
  });

  it('renders on a phone as well as on a desk', () => {
    show([390, 844]);
    expect(screen.getByText('Making a theme, end to end')).toBeTruthy();
    expect(screen.getByText('the one thing to notice')).toBeTruthy();
  });
});
