// @vitest-environment jsdom
//
// The persistent browse chrome, which exists for one reason: a nav pill whose
// lens can travel. The lens animates from the box it last held, so a bar that is
// rebuilt per screen can only ever ARRIVE - which is exactly what the TV did
// while each screen drew its own <TvTopNav>.
//
// Two things have to hold at once, and they pull against each other: the bar
// must keep its instance across a section change, and the new screen must still
// get to say where focus opens. The second is why the scope carries `entryKey`
// rather than simply not remounting.

import { focusSettled, markFocusSettled } from '@kroma/ui/testing';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type TvChrome,
  type TvNav,
  TvNavProvider,
  TvOutlet,
  type TvScreens,
  useNav,
} from '#tv/app/router';

afterEach(cleanup);

/** Counts its own mounts, so a remount is visible from the outside. */
function Bar() {
  const mounts = useRef(0);
  useEffect(() => {
    mounts.current += 1;
    MOUNTS.bar += 1;
  }, []);
  return <div>bar</div>;
}

const MOUNTS = { bar: 0 };

const CHROME: TvChrome = { routes: ['home', 'grid'], render: Bar };

function stubScreens(): TvScreens {
  const stub = (name: string) => () => <div>{`screen:${name}`}</div>;
  return {
    connect: stub('connect'),
    profiles: stub('profiles'),
    addProfile: stub('addProfile'),
    quick: stub('quick'),
    deviceSettings: stub('deviceSettings'),
    about: stub('about'),
    pin: stub('pin'),
    profileMenu: stub('profileMenu'),
    settingsGroup: stub('settingsGroup'),
    home: stub('home'),
    grid: stub('grid'),
    genres: stub('genres'),
    genre: stub('genre'),
    search: stub('search'),
    person: stub('person'),
    movie: stub('movie'),
    show: stub('show'),
    player: stub('player'),
    report: stub('report'),
  };
}

let nav: TvNav;
function Capture() {
  nav = useNav();
  return null;
}

function mount(screens = stubScreens()) {
  MOUNTS.bar = 0;
  return render(
    <TvNavProvider screens={screens} chrome={CHROME}>
      <Capture />
      <TvOutlet />
    </TvNavProvider>,
  );
}

describe('browse chrome', () => {
  it('keeps its instance across a section change', () => {
    mount();
    act(() => nav.reset('home'));
    expect(screen.getByText('screen:home')).toBeTruthy();
    const mountsAfterHome = MOUNTS.bar;

    act(() => nav.reset('grid', { kind: 'films' }));
    expect(screen.getByText('screen:grid')).toBeTruthy();
    // The screen swapped; the bar did not. This is the whole point: a remount
    // here is a lens that arrives instead of travelling.
    expect(MOUNTS.bar).toBe(mountsAfterHome);
  });

  it('unmounts the bar on a screen that does not wear it', () => {
    mount();
    act(() => nav.reset('home'));
    expect(screen.getByText('bar')).toBeTruthy();
    act(() => nav.reset('search'));
    expect(screen.queryByText('bar')).toBeNull();
  });

  it('lets each arriving screen decide where focus opens', () => {
    mount();
    act(() => nav.reset('home'));
    // Something on the home screen took the focus.
    act(() => markFocusSettled());
    expect(focusSettled()).toBe(true);

    // Arriving somewhere else must clear that, or the new screen's `autoFocus`
    // is ignored and the remote opens on nothing. The shared scope does not
    // remount, so this can only come from `entryKey`.
    act(() => nav.reset('grid', { kind: 'films' }));
    expect(focusSettled()).toBe(false);
  });
});
