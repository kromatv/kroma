// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { I18nManager } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDirection } from './direction';
import { DirectionRoot } from './direction-root.component';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Probe() {
  return <span data-testid="probe">{useDirection()}</span>;
}

describe('DirectionRoot', () => {
  it('runs the way React Native lays out, whatever the language', () => {
    vi.spyOn(I18nManager, 'getConstants').mockReturnValue({
      isRTL: true,
      doLeftAndRightSwapInRTL: true,
      localeIdentifier: null,
    });

    render(
      <DirectionRoot locale="fr">
        <Probe />
      </DirectionRoot>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('rtl');
  });

  it('runs left to right when React Native does', () => {
    render(
      <DirectionRoot locale="ar">
        <Probe />
      </DirectionRoot>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('ltr');
  });
});
