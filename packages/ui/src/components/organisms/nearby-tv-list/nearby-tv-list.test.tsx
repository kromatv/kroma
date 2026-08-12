// @vitest-environment jsdom
//
// The shared row list. What is worth pinning is the state each row shows,
// because the two shells that draw it used to decide this separately and a
// person holding both devices sees both.

import type { DiscoveredTv, Translate } from '@kroma/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NearbyTvList } from './nearby-tv-list';

afterEach(cleanup);

const SALON: DiscoveredTv = {
  handle: 'h-salon',
  name: 'Salon',
  platform: 'tvOS',
  check: 'K7QMR',
  confirmRequired: false,
  via: 'server',
};
const CHAMBRE: DiscoveredTv = { ...SALON, handle: 'h-chambre', name: 'Chambre', check: 'B4XRT' };

const t = ((key: string) => key) as Translate;

function list(props: Partial<Parameters<typeof NearbyTvList>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <NearbyTvList
      devices={[SALON, CHAMBRE]}
      outcomeFor={() => null}
      onSelect={onSelect}
      t={t}
      {...props}
    />,
  );
  return { onSelect };
}

describe('the rows', () => {
  it('draws one per television', () => {
    list();
    expect(screen.getByLabelText('Salon')).toBeTruthy();
    expect(screen.getByLabelText('Chambre')).toBeTruthy();
  });

  // There so a television that named itself after yours can be told from yours,
  // not because anyone is usually asked to type it.
  it('carries the check string each set is printing', () => {
    list();
    expect(screen.getByText('K7QMR')).toBeTruthy();
    expect(screen.getByText('B4XRT')).toBeTruthy();
  });

  it('hands the tapped device back', () => {
    const { onSelect } = list();
    screen.getByLabelText('Salon').click();
    expect(onSelect).toHaveBeenCalledWith(SALON);
  });
});

describe('a row that is doing something', () => {
  it('says so, and drops the check string while it does', () => {
    list({ connectingHandle: 'h-salon' });
    expect(screen.getByText('handoff.connecting')).toBeTruthy();
    expect(screen.queryByText('K7QMR')).toBeNull();
    // The spinner is inside the row's own name, so the row is what has to
    // announce that it is working.
    expect(screen.getByLabelText('Salon').getAttribute('aria-busy')).toBe('true');
  });

  it('is still pressable, since nothing has ended yet', () => {
    const { onSelect } = list({ connectingHandle: 'h-salon' });
    screen.getByLabelText('Salon').click();
    expect(onSelect).toHaveBeenCalled();
  });
});

describe('a row that has finished', () => {
  it('says how it went', () => {
    list({ outcomeFor: (d) => (d.handle === 'h-salon' ? 'done' : null) });
    expect(screen.getByText('handoff.rowDone')).toBeTruthy();
  });

  it('names the refusal when it did not go through', () => {
    list({ outcomeFor: (d) => (d.handle === 'h-salon' ? 'gone' : null) });
    expect(screen.getByText('handoff.gone')).toBeTruthy();
  });

  // The beacon behind it is spent; the row is only still here to be read.
  it('stops being pressable', () => {
    const { onSelect } = list({ outcomeFor: (d) => (d.handle === 'h-salon' ? 'done' : null) });
    screen.getByLabelText('Salon').click();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('the platform under the name', () => {
  it('is shown when it says something the name does not', () => {
    list();
    expect(screen.getAllByText('tvOS').length).toBeGreaterThan(0);
  });

  // A television with no name of its own publishes its platform as one, so this
  // would print the same word twice.
  it('is dropped when it IS the name', () => {
    render(
      <NearbyTvList
        devices={[{ ...SALON, name: 'tvOS' }]}
        outcomeFor={() => null}
        onSelect={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getAllByText('tvOS')).toHaveLength(1);
  });
});
