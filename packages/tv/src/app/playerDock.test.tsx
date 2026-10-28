// @vitest-environment jsdom
import type { MediaItem } from '@kromatv/client/media';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { type PlayerDock, usePlayerDock, usePlayerSlot } from '#tv/app/playerDock';
import { type TvNav, TvNavProvider, TvOutlet, useNav } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

const film = (id: string) => ({ id, title: id }) as unknown as MediaItem;

let nav: TvNav;
let dock: PlayerDock;
const life = { mounts: [] as string[], unmounts: [] as string[] };

function Capture() {
  const currentNav = useNav();
  const currentDock = usePlayerDock();
  useEffect(() => {
    nav = currentNav;
    dock = currentDock;
  });
  return null;
}

function Player() {
  const { item, docked } = usePlayerSlot();
  useEffect(() => {
    life.mounts.push(item.id);
    return () => {
      life.unmounts.push(item.id);
    };
  }, [item.id]);
  return <div>{`player:${item.id}:${docked ? 'docked' : 'shown'}`}</div>;
}

function mount() {
  life.mounts = [];
  life.unmounts = [];
  render(
    <TvNavProvider screens={stubScreens({ player: Player })}>
      <Capture />
      <TvOutlet />
    </TvNavProvider>,
  );
  act(() => nav.reset('movie', { item: film('a') }));
}

function playAndDock(id: string) {
  act(() => nav.go('player', { item: film(id) }));
  act(() => dock.dock(film(id), nav.back));
}

describe('the player dock', () => {
  it('keeps the player mounted, out of sight, behind the screen it left to', () => {
    mount();

    playAndDock('a');

    expect(screen.getByText('screen:movie')).toBeTruthy();
    expect(screen.getByText('player:a:docked')).toBeTruthy();
    expect(life.mounts).toEqual(['a']);
    expect(life.unmounts).toEqual([]);
  });

  it('brings the same player back to the front when its title is played again', () => {
    mount();
    playAndDock('a');

    act(() => nav.go('player', { item: film('a') }));

    expect(screen.getByText('player:a:shown')).toBeTruthy();
    expect(screen.queryByText('screen:movie')).toBeNull();
    expect(life.mounts).toEqual(['a']);
    expect(dock.docked).toBeNull();
  });

  it('lets an expanded player leave like any other', () => {
    mount();
    playAndDock('a');
    act(() => nav.go('player', { item: film('a') }));

    act(() => nav.back());

    expect(screen.queryByText(/^player:/)).toBeNull();
    expect(life.unmounts).toEqual(['a']);
  });

  it('replaces the docked player when another title starts', () => {
    mount();
    playAndDock('a');

    act(() => nav.go('player', { item: film('b') }));

    expect(screen.getByText('player:b:shown')).toBeTruthy();
    expect(life.unmounts).toEqual(['a']);
    expect(dock.docked).toBeNull();
  });

  it('ends the session when the dock is cleared', () => {
    mount();
    playAndDock('a');

    act(() => dock.undock());

    expect(screen.queryByText(/^player:/)).toBeNull();
    expect(screen.getByText('screen:movie')).toBeTruthy();
    expect(life.unmounts).toEqual(['a']);
  });

  it('unmounts a player left without docking', () => {
    mount();
    act(() => nav.go('player', { item: film('a') }));

    act(() => nav.back());

    expect(screen.queryByText(/^player:/)).toBeNull();
    expect(life.unmounts).toEqual(['a']);
  });
});
