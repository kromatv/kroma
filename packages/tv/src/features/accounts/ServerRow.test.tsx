// @vitest-environment jsdom

import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerProbe } from '#tv/app/useServersHealth';
import { ActionRow, ServerRow, ServerRowSkeleton } from '#tv/features/accounts/ServerRow';

const show = (ui: ReactElement) => render(onScreen(ui));

const row = (probe?: ServerProbe, isNew?: boolean) =>
  show(
    <ServerRow
      address="http://kroma.local:4040"
      fallbackName="kroma.local"
      isNew={isNew}
      probe={probe}
      onPress={vi.fn()}
    />,
  );

afterEach(() => {
  cleanup();
  clearPressGuard();
});

describe('ServerRow', () => {
  it('takes its name from the health answer, and the host name until it lands', () => {
    row();
    expect(screen.getByText('kroma.local')).toBeTruthy();

    cleanup();
    row({ online: true, name: 'Salon' });
    expect(screen.getByText('Salon')).toBeTruthy();
  });

  it('sums up what the server answered on one meta line', () => {
    row({ online: true, version: '1.4.2', items: 412, shows: 37 });
    expect(screen.getByText('v1.4.2 · 412 titles · 37 series')).toBeTruthy();
  });

  it('leaves the meta line empty for a server that answered nothing but "up"', () => {
    const { container } = row({ online: true });
    expect(container.textContent).not.toContain('·');
  });

  it('says nothing about a server that is not answering', () => {
    const { container } = row({ online: false, version: '1.4.2' });
    expect(container.textContent).not.toContain('1.4.2');
  });

  it('marks a server this profile has never been on', () => {
    row({ online: true }, true);
    expect(screen.getByText('new')).toBeTruthy();
  });

  it('opens the server it was pressed on', () => {
    const onPress = vi.fn();
    show(
      <ServerRow
        address="http://kroma.local:4040"
        fallbackName="kroma.local"
        onPress={onPress}
        autoFocus
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /kroma.local/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ActionRow', () => {
  it('presses like the server rows above it', () => {
    const onPress = vi.fn();
    show(
      <ActionRow
        icon="plus"
        title="Add manually"
        sub="Type an address"
        onPress={onPress}
        autoFocus
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Add manually/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ServerRowSkeleton', () => {
  it('is never a stop, so the remote walks straight past it', () => {
    const { container } = show(<ServerRowSkeleton />);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
  });
});
