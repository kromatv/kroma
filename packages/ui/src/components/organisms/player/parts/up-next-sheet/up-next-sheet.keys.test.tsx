// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import type { RemoteKey } from '#ui/lib/remote-keys';
import { onScreen, wearsRing } from '#ui/testing';
import { UpNextSheet } from './up-next-sheet';
import { DATA } from './up-next-sheet.fixtures';

vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'development');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sheet(
  over: { onClose?: () => void; onPlay?: (item: { id: string }) => void; remote?: boolean } = {},
) {
  const panel = createRef<PanelHandle>();
  render(
    onScreen(
      <UpNextSheet
        ref={panel}
        data={DATA}
        open
        revealed
        onOpen={() => {}}
        onClose={over.onClose ?? (() => {})}
        onPlay={over.onPlay ?? (() => {})}
      />,
      { remote: over.remote },
    ),
  );
  const press = (key: RemoteKey) => act(() => void panel.current?.onKey(key));
  return { press };
}

const control = (name: string) => screen.getByRole('button', { name });

describe('the up-next sheet where nothing feeds the navigator', () => {
  it('walks the row on ▶', () => {
    const { press } = sheet();

    press('Right');

    expect(wearsRing(control('Lord Snow'))).toBe(true);
  });

  it('walks back on ◀', () => {
    const { press } = sheet();
    press('Right');
    press('Right');

    press('Left');

    expect(wearsRing(control('Lord Snow'))).toBe(true);
  });

  it('drops to the line below on ▼', () => {
    const { press } = sheet();

    press('Down');

    expect(wearsRing(control('Blade Runner 2049'))).toBe(true);
  });

  it('plays the card it rests on', () => {
    const onPlay = vi.fn();
    const { press } = sheet({ onPlay });
    press('Right');

    press('Enter');

    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lord Snow' }));
  });

  it('closes on Back rather than moving anything', () => {
    const onClose = vi.fn();
    const { press } = sheet({ onClose });
    press('Right');

    press('Back');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(wearsRing(control('Lord Snow'))).toBe(true);
  });
});

describe('the up-next sheet on a browser television, whose remote the player swallows', () => {
  it('walks the row on ▶', () => {
    const { press } = sheet({ remote: true });

    press('Right');

    expect(wearsRing(control('Lord Snow'))).toBe(true);
  });

  it('drops to the line below on ▼', () => {
    const { press } = sheet({ remote: true });

    press('Down');

    expect(wearsRing(control('Blade Runner 2049'))).toBe(true);
  });
});
