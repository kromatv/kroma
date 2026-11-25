// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlacedBands, SurfaceBand } from './surface-band.component';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const Shelf = ({ children }: Readonly<{ children?: ReactNode }>) => (
  <SurfaceBand part="Surface.Shelf">{children}</SurfaceBand>
);

const MISPLACED =
  "<Surface.Shelf> is not a direct child of <Surface.Root>, so the Root cannot place it and draws it inside its scrolling panel. Write it in <Surface.Root>'s own children, not in a component of your own.";

const LEFT_OUT =
  "<Surface.Root> was given a <Surface.Panel>, so it draws nothing else that is not a band (children left out: 2). Write them inside the panel, and write a band in <Surface.Root>'s own children, not in a component of your own.";

describe('the bands a Root placed', () => {
  it('say how many children the Root had nowhere to draw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <PlacedBands surface="Surface" unplaced={2}>
        <Shelf>Actions</Shelf>
      </PlacedBands>,
    );

    expect(warn).toHaveBeenCalledWith(LEFT_OUT);
  });

  it('say it once, however often the Root renders', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bands = (
      <PlacedBands surface="Surface" unplaced={2}>
        <Shelf>Actions</Shelf>
      </PlacedBands>
    );

    const { rerender } = render(bands);
    rerender(bands);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('a surface band', () => {
  it('says nothing when its Root placed it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <PlacedBands surface="Surface" unplaced={0}>
        <Shelf>Actions</Shelf>
      </PlacedBands>,
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it('names itself and its Root when it renders inside another band', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <PlacedBands surface="Surface" unplaced={0}>
        <Shelf>
          <Shelf>Actions</Shelf>
        </Shelf>
      </PlacedBands>,
    );

    expect(warn).toHaveBeenCalledWith(MISPLACED);
  });

  it('says nothing outside any surface', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<Shelf>Actions</Shelf>);

    expect(warn).not.toHaveBeenCalled();
  });

  it('starts over in a surface opened from inside another band', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <PlacedBands surface="Surface" unplaced={0}>
        <Shelf>
          <PlacedBands surface="Surface" unplaced={0}>
            <Shelf>Actions</Shelf>
          </PlacedBands>
        </Shelf>
      </PlacedBands>,
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it('says nothing in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <PlacedBands surface="Surface" unplaced={0}>
        <Shelf>
          <Shelf>Actions</Shelf>
        </Shelf>
      </PlacedBands>,
    );

    expect(warn).not.toHaveBeenCalled();
  });
});
