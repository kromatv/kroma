// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './button';

afterEach(cleanup);

function Anchor({ to, ...host }: Readonly<Record<string, unknown>>) {
  return <View {...(host as object)} {...({ href: to } as object)} />;
}

const host = (label: string) => screen.getByLabelText(label);

describe('a Button that delegates its host to a link', () => {
  it('renders the button itself as the anchor carrying the route', () => {
    render(
      <Button label="Plus d'infos" asChild>
        <Anchor to="/movies/dune" />
      </Button>,
    );

    expect(host("Plus d'infos").tagName).toBe('A');
    expect(host("Plus d'infos").getAttribute('href')).toBe('/movies/dune');
  });

  it('keeps composing its label and its glyph inside the element', () => {
    const { container } = render(
      <Button label="Plus d'infos" icon="info-circle" asChild>
        <Anchor to="/movies/dune" />
      </Button>,
    );

    expect(host("Plus d'infos").textContent).toBe("Plus d'infos");
    expect(container.querySelector('.tabler-icon-info-circle')).toBeTruthy();
  });

  it('draws the spinner of a loading button on the element it delegates to', () => {
    const { container } = render(
      <Button label="Plus d'infos" icon="info-circle" loading asChild>
        <Anchor to="/movies/dune" />
      </Button>,
    );

    expect(host("Plus d'infos").tagName).toBe('A');
    expect(container.querySelector('.tabler-icon-info-circle')).toBeNull();
  });

  it('puts what the element was written around after the label', () => {
    render(
      <Button label="Plus d'infos" asChild>
        <Anchor to="/movies/dune">
          <span data-testid="tail">4K</span>
        </Anchor>
      </Button>,
    );

    expect(host("Plus d'infos").textContent).toBe("Plus d'infos4K");
  });

  it('renders no anchor at all for a disabled button', () => {
    render(
      <Button label="Plus d'infos" disabled asChild>
        <Anchor to="/movies/dune" />
      </Button>,
    );

    expect(host("Plus d'infos").tagName).not.toBe('A');
  });
});
