// @vitest-environment jsdom
import type { MediaItem } from '@kroma/core';
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

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

function Bar() {
  const mounts = useRef(0);
  useEffect(() => {
    mounts.current += 1;
    MOUNTS.bar += 1;
  }, []);
  return <div>bar</div>;
}

function Movie() {
  useEffect(() => {
    MOUNTS.movie += 1;
  }, []);
  return <div>screen:movie</div>;
}

const film = (id: string) => ({ id, title: id }) as unknown as MediaItem;

const MOUNTS = { bar: 0, movie: 0 };

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
    // `entryKey`; otherwise the new screen's `autoFocus` is ignored.
    act(() => nav.reset('grid', { kind: 'films' }));
    expect(focusSettled()).toBe(false);
  });
});

describe('a route that replaces its own subject', () => {
  it('remounts the screen when a film opens another film', () => {
    const screens = stubScreens();
    screens.movie = Movie;
    mount(screens);

    MOUNTS.movie = 0;
    act(() => nav.go('movie', { item: film('a') }));
    expect(MOUNTS.movie).toBe(1);

    act(() => markFocusSettled());
    act(() => nav.go('movie', { item: film('b') }));

    expect(MOUNTS.movie).toBe(2);
    expect(focusSettled()).toBe(false);
  });
});

describe('the dev navigation stack', () => {
  it('restores a stack the running build knows every screen of', () => {
    sessionStorage.setItem('kroma:dev-nav', JSON.stringify([{ name: 'home' }, { name: 'search' }]));
    mount();

    expect(screen.getByText('screen:search')).toBeTruthy();
    expect(nav.depth).toBe(2);
  });

  it('falls back to the profile picker on a stack it cannot render', () => {
    sessionStorage.setItem('kroma:dev-nav', JSON.stringify([{ name: 'home' }, 'search']));
    mount();

    expect(screen.getByText('screen:profiles')).toBeTruthy();
    expect(nav.depth).toBe(1);
  });

  it('falls back to the profile picker on a screen this build dropped', () => {
    sessionStorage.setItem('kroma:dev-nav', JSON.stringify([{ name: 'retired' }]));
    mount();

    expect(screen.getByText('screen:profiles')).toBeTruthy();
  });

  it('does not take a route name off the registry prototype', () => {
    sessionStorage.setItem('kroma:dev-nav', JSON.stringify([{ name: 'toString' }]));
    mount();

    expect(screen.getByText('screen:profiles')).toBeTruthy();
  });
});
