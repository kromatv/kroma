// @vitest-environment jsdom
import { Focusable } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type TvNav, TvNavProvider, useNav } from '#tv/app/router';

vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'Max' } }),
}));
vi.mock('#tv/app/providers/connection', () => ({
  useConnection: () => ({ client: null, online: true }),
}));
// Late-mounting in its own right, and not what this file is about.
vi.mock('#tv/features/cast/CastRemotes', () => ({ CastRemotes: () => null }));

const { configureRemote } = await import('@kroma/ui/kit');
const { TvTopNav } = await import('#tv/features/catalog/home/TopNav');

beforeAll(() => configureRemote());
afterEach(cleanup);

const LABELS = ['Back', 'Home', 'Max', 'Content'];

// A focused control paints itself: the amber ring is a box-shadow, and the ones
// that wear none over artwork answer with their focus scale.
const lit = (): string[] =>
  LABELS.filter((label) => {
    const style = screen.queryByLabelText(label)?.getAttribute('style') ?? '';
    return style.includes('box-shadow') || /transform: scale\(1\.\d/.test(style);
  });

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

let nav: TvNav;
function Capture() {
  nav = useNav();
  return null;
}

describe('the browse top bar', () => {
  it('reaches Back before the pill, however late the button arrives', () => {
    // The bar as the outlet mounts it: once, above whichever screen is current.
    render(
      onScreen(
        <TvNavProvider screens={{} as never}>
          <Capture />
          <TvTopNav />
          <Focusable label="Content" autoFocus />
        </TvNavProvider>,
      ),
    );
    expect(lit()).toEqual(['Content']);

    // Home first, then a title: the bar does not remount, so this is where the
    // Back button arrives.
    act(() => nav.go('movie', { item: { id: 'm1' } as never }));

    press('ArrowUp');
    expect(lit()).toEqual(['Back']);
    press('ArrowRight');
    expect(lit()).toEqual(['Home']);
    press('ArrowLeft');
    expect(lit()).toEqual(['Back']);
  });
});
