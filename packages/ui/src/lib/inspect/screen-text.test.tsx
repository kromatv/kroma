// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { nameComponent } from '../component-names';
import { createFocusHolder } from '../focus-holder';
import { InspectAnchor } from './inspect-anchor';
import type { ScreenRow } from './screen-rows';
import { screenText } from './screen-text';

afterEach(cleanup);

function Plate({ label }: Readonly<{ label: string }>) {
  return <div aria-label={label} />;
}

nameComponent(Plate, 'Plate');

function row(depth: number, name: string, extra: Partial<ScreenRow> = {}): ScreenRow {
  return { depth, name, props: {}, box: null, ...extra };
}

function text(rows: ScreenRow[]): string {
  return screenText({ fibers: rows.length, truncated: false, rows });
}

describe('a screen as text', () => {
  it('writes one component a line, indented two spaces a level', () => {
    const rows = [
      row(0, 'Dialog.Root'),
      row(1, 'Dialog.Panel'),
      row(2, 'Text'),
      row(1, 'Dialog.Footer'),
    ];

    expect(text(rows)).toBe('Dialog.Root\n  Dialog.Panel\n    Text\n  Dialog.Footer');
  });

  it('rounds the box and writes it as x,y widthxheight', () => {
    const box = { x: 60.6, y: 586.2, width: 173.5, height: 71 };

    expect(text([row(0, 'Button', { box })])).toBe('Button  61,586 174x71');
  });

  it('writes a true prop as its name and every other primitive as name=value', () => {
    const props = { autoFocus: true, disabled: false, size: 'tv', gap: 12, rating: null };

    expect(text([row(0, 'Button', { props })])).toBe(
      'Button  autoFocus disabled=false size="tv" gap=12 rating=null',
    );
  });

  it('keeps a text of several lines on one line', () => {
    const props = { children: 'Un\nDeux' };

    expect(text([row(0, 'Text', { props })])).toBe(String.raw`Text  children="Un\nDeux"`);
  });

  it('leaves out a prop that is not a primitive and keeps a secret', () => {
    const props = {
      onPress: '[function]',
      children: '[element]',
      style: '[object]',
      items: '[array 3]',
      value: '[secret]',
    };

    expect(text([row(0, 'PinField', { props })])).toBe('PinField  value="[secret]"');
  });

  it('marks the component that holds the focus', () => {
    const rows = [
      row(0, 'Button'),
      row(1, 'Focusable', { focused: true, props: { label: 'Lire' } }),
    ];

    expect(text(rows)).toBe('Button\n  Focusable (focused)  label="Lire"');
  });

  it('says where a screen was cut', () => {
    const rows = [row(0, 'Box'), row(0, 'Box')];

    const cut = screenText({ fibers: 9, truncated: true, rows });

    expect(cut).toBe('Box\nBox\n… cut at 2 components');
  });

  it('reads an empty screen as no text', () => {
    expect(text([])).toBe('');
  });

  it('reads what is on screen when it is given no rows', () => {
    render(
      <>
        <InspectAnchor focus={createFocusHolder()} />
        <Plate label="Lire" />
      </>,
    );

    expect(screenText()).toBe('Plate  0,0 0x0  label="Lire"');
  });
});
