// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CastReceiverProvider } from '#tv/features/cast/CastReceiverProvider';

afterEach(cleanup);

describe('CastReceiverProvider', () => {
  it('renders the app before a server is reached', () => {
    render(
      <CastReceiverProvider client={null} name="Salon">
        <div>picker</div>
      </CastReceiverProvider>,
    );
    expect(screen.getByText('picker')).toBeTruthy();
  });
});
