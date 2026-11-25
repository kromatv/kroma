import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { surfaceBands } from './surface-bands';

const Header = ({ children }: Readonly<{ children?: ReactNode }>) => children;
const Panel = ({ children }: Readonly<{ children?: ReactNode }>) => children;
const Footer = ({ children }: Readonly<{ children?: ReactNode }>) => children;
const Other = ({ children }: Readonly<{ children?: ReactNode }>) => children;

const parts = { header: Header, panel: Panel, footer: Footer };
const band = (of: typeof Header, children?: ReactNode) => createElement(of, null, children);

// `Children.toArray` keys what it hands back, so a band comes out a clone of
// what went in and only what it holds identifies it.
const held = (node: ReactNode) =>
  isValidElement(node) ? (node.props as { children?: ReactNode }).children : undefined;

describe('surfaceBands', () => {
  it('sorts the three bands out of the children, whatever order they came in', () => {
    const bands = surfaceBands(
      [band(Footer, 'Enregistrer'), band(Header, 'Titre'), band(Panel, 'Corps')],
      parts,
    );
    expect(held(bands.header)).toBe('Titre');
    expect(held(bands.panel)).toBe('Corps');
    expect(held(bands.footer)).toBe('Enregistrer');
    expect(bands.loose).toEqual([]);
  });

  it('leaves everything that claimed no band to the panel the Root draws', () => {
    const stray = band(Other, 'Ailleurs');
    const bands = surfaceBands(['Texte', stray], parts);
    expect(bands.header).toBeUndefined();
    expect(bands.loose).toHaveLength(2);
  });

  it('does not count a band that holds nothing, so no shelf is drawn for it', () => {
    const bands = surfaceBands([band(Footer, null), band(Header)], parts);
    expect(bands.footer).toBeUndefined();
    expect(bands.header).toBeUndefined();
    expect(bands.loose).toEqual([]);
  });

  it('takes a band written inside a fragment, and leaves the rest of the fragment loose', () => {
    const together = createElement(
      Fragment,
      null,
      band(Header, 'Titre'),
      'Corps',
      band(Footer, 'Fermer'),
    );

    const bands = surfaceBands(together, parts);

    expect(held(bands.header)).toBe('Titre');
    expect(held(bands.footer)).toBe('Fermer');
    expect(bands.loose).toEqual(['Corps']);
  });

  it('does not count a band that holds only an empty fragment', () => {
    const footer = band(Footer, createElement(Fragment, null, false));

    const bands = surfaceBands([footer], parts);

    expect(bands.footer).toBeUndefined();
  });

  it('counts what was written beside a panel and is no band, which the Root has nowhere to draw', () => {
    const stray = band(Other, 'Ailleurs');

    const bands = surfaceBands([band(Panel, 'Corps'), stray, band(Footer, 'Fermer')], parts);

    expect(bands.unplaced).toBe(1);
  });

  it('counts nothing when the Root draws the panel itself, since the rest goes inside it', () => {
    const stray = band(Other, 'Ailleurs');

    const bands = surfaceBands([band(Header, 'Titre'), 'Texte', stray], parts);

    expect(bands.unplaced).toBe(0);
  });
});
