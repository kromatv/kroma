// @vitest-environment jsdom
//
// The persistent browse chrome keeps its bar instance across a section change
// (so its focus lens can animate rather than snap), while still letting each
// arriving screen decide where focus opens via `entryKey`.

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
    <TvNavProvider screens={screens} chrome={[CHROME]}>
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
    act(() => markFocusSettled());
    expect(focusSettled()).toBe(true);

    // The shared scope does not remount, so clearing this can only come from
    // `entryKey` — otherwise the new screen's `autoFocus` is ignored.
    act(() => nav.reset('grid', { kind: 'films' }));
    expect(focusSettled()).toBe(false);
  });
});
