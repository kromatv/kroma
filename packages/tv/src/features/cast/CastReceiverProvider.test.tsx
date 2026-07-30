// @vitest-environment jsdom
//
// The cast receiver is mounted ABOVE the router, so it renders on the signed-out
// picker too - and on a fresh install (nothing paired yet, no server saved) there
// is no client there at all. It used to ask for one with `useClient()`, which
// throws: not one screen failing, but React unmounting the whole tree. What a
// brand-new TV showed on first launch was therefore a black screen instead of the
// profile picker - the one screen from which a server can be added.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CastReceiverProvider } from '#tv/features/cast/CastReceiverProvider';

afterEach(cleanup);

describe('CastReceiverProvider', () => {
  it('renders the app before a server is reached', () => {
    render(
      <CastReceiverProvider client={null}>
        <div>picker</div>
      </CastReceiverProvider>,
    );
    expect(screen.getByText('picker')).toBeTruthy();
  });
});
