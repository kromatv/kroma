// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { CONTROL } from '#ui/lib/field-shell';
import { Callout, type CalloutTone } from './callout';

afterEach(cleanup);

const TONES: readonly CalloutTone[] = ['neutral', 'accent', 'success', 'danger'];

function block(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

function glyphWidth(container: HTMLElement): string | null {
  return container.querySelector('svg')?.getAttribute('width') ?? null;
}

describe('<Callout>', () => {
  it('renders the whole row from one line', () => {
    const { container } = render(
      <Callout.Root
        size="sm"
        tone="danger"
        icon="alert-triangle"
        title="Le module a refuse de demarrer"
        detail="GET /api/module/tv.kroma.remote/remote 502"
        actions={<Text>Reessayer</Text>}
      />,
    );
    expect(glyphWidth(container)).toBe('16');
    expect(screen.getByText('Le module a refuse de demarrer')).toBeTruthy();
    expect(screen.getByText('GET /api/module/tv.kroma.remote/remote 502')).toBeTruthy();
    expect(screen.getByText('Reessayer')).toBeTruthy();
  });

  it('writes from its parts exactly what the sugar writes', () => {
    const sugar = render(
      <Callout.Root
        tone="danger"
        icon="alert-triangle"
        title="Echec"
        detail="502"
        actions={<Text>Reessayer</Text>}
      />,
    ).container.innerHTML;
    cleanup();
    const parts = render(
      <Callout.Root tone="danger">
        <Callout.Title>Echec</Callout.Title>
        <Callout.Detail>502</Callout.Detail>
        <Callout.Actions>
          <Text>Reessayer</Text>
        </Callout.Actions>
        <Callout.Media name="alert-triangle" />
      </Callout.Root>,
    ).container.innerHTML;
    expect(parts).toBe(sugar);
  });

  it('sorts a media and an actions child out of the message column wherever they are written', () => {
    const { container } = render(
      <Callout.Root>
        <Callout.Actions>
          <Text>tail</Text>
        </Callout.Actions>
        <Callout.Title>middle</Callout.Title>
        <Callout.Media name="info-circle" />
      </Callout.Root>,
    );
    const order = [...block(container).children].map((node) => node.textContent);
    expect(order[0]).toBe('');
    expect(order[1]).toBe('middle');
    expect(order[2]).toBe('tail');
  });

  it('paints a different well for every tone', () => {
    const wells = TONES.map((tone) => {
      const { container } = render(<Callout.Root tone={tone} title="x" />);
      const paint = getComputedStyle(block(container));
      cleanup();
      return `${paint.backgroundColor}|${paint.borderColor}`;
    });
    expect(new Set(wells).size).toBe(TONES.length);
  });

  it('takes the control shell it was given rather than paddings of its own', () => {
    const { container } = render(<Callout.Root size="tv" icon="info-circle" title="x" />);
    const paint = getComputedStyle(block(container));
    expect(paint.paddingLeft).toBe(`${CONTROL.tv.px}px`);
    expect(paint.paddingTop).toBe(`${CONTROL.tv.py}px`);
    expect(glyphWidth(container)).toBe('26');
  });

  it('refuses a part used outside the Root, rather than rendering something wrong', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Callout.Title>Echec</Callout.Title>)).toThrow(/Callout.Title/);
    quiet.mockRestore();
  });
});
