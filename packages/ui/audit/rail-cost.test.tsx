import { record } from '@kroma/react-audit';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { Rail } from '#ui/components/organisms/rail';
import { configureRemote } from '#ui/lib/focus-remote';
import { layout, measuring, onScreen } from '#ui/testing';

beforeAll(() => configureRemote());
afterEach(cleanup);

const TITLES = Array.from({ length: 40 }, (_, at) => `Title ${at}`);
const VIEWPORT = 1920;
const PITCH = 320;
const LAST_STILL_PRESS = 4;
const FIRST_MOVING_PRESS = 5;
const LAST_PRESS_BEFORE_GROWTH = 6;
const PRESSES_PAST_GROWTH = 8;

function HomeRail() {
  return (
    <Rail.Root>
      <Rail.Title>Reprendre</Rail.Title>
      <Rail.List pitch={PITCH} height={180}>
        {TITLES.map((title, at) => (
          <Focusable key={title} label={title} autoFocus={at === 0} />
        ))}
      </Rail.List>
    </Rail.Root>
  );
}

function mountedTiles(root: Element): number {
  return root.querySelectorAll('[aria-label^="Title "]').length;
}

function lit(root: Element): string | null {
  const ringed = [...root.querySelectorAll<HTMLElement>('[aria-label^="Title "]')].find(
    (tile) => tile.style.boxShadow !== '',
  );
  return ringed?.getAttribute('aria-label') ?? null;
}

function travelled(root: Element): number {
  const strips = [...root.querySelectorAll<HTMLElement>('div')].filter((el) =>
    el.style.transform.includes('translateX'),
  );
  if (strips.length !== 1) {
    throw new Error(`the rail should translate exactly one strip, found ${strips.length}`);
  }
  const px = /translateX\((-?[\d.]+)px\)/.exec(strips[0]?.style.transform ?? '');
  if (!px?.[1]) throw new Error('the rail translated a strip by no readable distance');
  return Math.abs(Number(px[1]));
}

interface Walked {
  opened: number;
  tiles: number;
  travelled: number;
  lit: string | null;
  churn: ReadonlyArray<readonly [string, number]>;
}

function walk(presses: number): Walked {
  const run = record();
  const { container } = render(onScreen(<HomeRail />));
  layout(measuring(container), { width: VIEWPORT });
  const opened = mountedTiles(container);

  for (let press = 0; press < presses; press += 1) {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
  }

  return {
    opened,
    tiles: mountedTiles(container),
    travelled: travelled(container),
    lit: lit(container),
    churn: run.stop().churn,
  };
}

describe('a rail walked by the D-pad', () => {
  it('opens on a window rather than the whole row', () => {
    const walked = walk(0);

    expect(walked.opened).toBeGreaterThan(0);
    expect(walked.opened).toBeLessThan(TITLES.length);
  });

  it('walks the focus ring one tile per press', () => {
    const walked = walk(PRESSES_PAST_GROWTH);

    expect(walked.lit).toBe(`Title ${PRESSES_PAST_GROWTH}`);
  });

  it('holds the row still while the ring crosses it', () => {
    const walked = walk(LAST_STILL_PRESS);

    expect(walked.travelled).toBe(0);
    expect(walked.tiles).toBe(walked.opened);
  });

  it('translates the row on the press that reaches the edge margin', () => {
    const walked = walk(FIRST_MOVING_PRESS);

    expect(walked.travelled).toBeGreaterThan(0);
    expect(walked.tiles).toBe(walked.opened);
  });

  it('leaves the mounted window alone until the ring reaches its end', () => {
    const walked = walk(LAST_PRESS_BEFORE_GROWTH);

    expect(walked.tiles).toBe(walked.opened);
  });

  it('grows the window one tile per press past that end', () => {
    const walked = walk(PRESSES_PAST_GROWTH);

    expect(walked.tiles).toBe(walked.opened + (PRESSES_PAST_GROWTH - LAST_PRESS_BEFORE_GROWTH));
  });

  it('rebuilds no tile it already had on screen', () => {
    const walked = walk(PRESSES_PAST_GROWTH);

    expect(walked.churn).toEqual([]);
  });
});
