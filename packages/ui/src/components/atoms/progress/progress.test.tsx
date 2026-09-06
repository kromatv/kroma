// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { declared } from '#ui/testing';
import { Progress } from './progress';

afterEach(cleanup);

function bar(ui: ReactElement): HTMLElement {
  const { container } = render(ui);
  const track = container.querySelector('[role=progressbar]');
  if (!track) throw new Error('no bar was rendered');
  return track as HTMLElement;
}

const layers = (ui: ReactElement) => [...bar(ui).children] as HTMLElement[];

describe('<Progress>', () => {
  it('draws the loaded range as its own layer under the played fill', () => {
    const [loaded, played] = layers(<Progress value={0.25} buffered={0.75} />);

    expect(loaded?.style.right).toBe('25%');
    expect(played?.style.right).toBe('75%');
  });

  it('draws the loaded range dimmer than the fill that sits on it', () => {
    const [loaded, played] = layers(<Progress value={0.25} buffered={0.75} />);

    const dim = Number(getComputedStyle(loaded as HTMLElement).opacity);
    expect(dim).toBeGreaterThan(0);
    expect(dim).toBeLessThan(Number(getComputedStyle(played as HTMLElement).opacity || 1));
  });

  it('holds a loaded range trailing the position back to the position', () => {
    const [loaded] = layers(<Progress value={0.25} buffered={0.1} />);

    expect(loaded?.style.right).toBe('75%');
  });

  it('draws nothing but the fill when no loaded range was reported', () => {
    const [played, ...rest] = layers(<Progress value={0.25} />);

    expect(played?.style.right).toBe('75%');
    expect(rest).toHaveLength(0);
  });

  it('keeps announcing where the viewer is while it waits on data', () => {
    const track = bar(<Progress value={0.25} waiting />);

    expect(track.getAttribute('aria-valuenow')).toBe('25');
    expect(track.getAttribute('aria-busy')).toBe('true');
  });

  it('breathes the track while it waits, and the fill still says where it stopped', () => {
    const [wash, played] = layers(<Progress value={0.25} waiting />);

    expect(declared(wash?.firstElementChild as Element, 'animation-name')).toBeTruthy();
    expect(played?.style.right).toBe('75%');
  });

  it('breathes nothing once the data is flowing again', () => {
    const [played, ...rest] = layers(<Progress value={0.25} />);

    expect(declared(played as Element, 'animation-name')).toBeNull();
    expect(rest).toHaveLength(0);
  });

  it('sweeps rather than breathes when there is no position to keep', () => {
    const track = bar(<Progress value={0.25} indeterminate waiting />);

    expect(track.getAttribute('aria-valuenow')).toBeNull();
    expect(track.getAttribute('aria-busy')).toBe('true');
    expect(track.children).toHaveLength(1);
  });
});
