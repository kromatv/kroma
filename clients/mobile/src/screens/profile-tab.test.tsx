// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ADULT = { id: 'u1', username: 'Ana', email: 'ana@kroma.tv', kids: false };
const KID = { id: 'kid', username: 'Léo', email: 'kids-kid@kroma.invalid', kids: true };

const app = vi.hoisted(() => ({
  user: { id: 'u1', username: 'Ana', email: 'ana@kroma.tv', kids: false },
}));

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('#mobile/lib/i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('#mobile/lib/downloads', () => ({ useDownloads: () => ({ entries: [], totalBytes: 0 }) }));
vi.mock('#mobile/lib/session', () => ({
  useSession: () => ({ user: app.user, switchProfile: vi.fn(), signOut: vi.fn() }),
  useClient: () => ({ media: { artwork: { resolve: () => null } } }),
}));
vi.mock('#mobile/components/avatar.component', () => ({ Avatar: () => null }));

const { default: Profile } = await import('../app/(app)/(tabs)/profile');

afterEach(() => {
  cleanup();
  app.user = ADULT;
});

describe('the account tab', () => {
  it('gives a profile its lock, pairing a television and signing out', () => {
    render(<Profile />);

    expect(screen.getByText('account.profileLock')).toBeTruthy();
    expect(screen.getByText('connect.title')).toBeTruthy();
    expect(screen.getByText('auth.logout')).toBeTruthy();
  });

  it('leaves a Kids session switching profile as its one way out', () => {
    app.user = KID;

    render(<Profile />);

    expect(screen.getByText('nav.changeProfile')).toBeTruthy();
    expect(screen.queryByText('account.profileLock')).toBeNull();
    expect(screen.queryByText('connect.title')).toBeNull();
    expect(screen.queryByText('auth.logout')).toBeNull();
  });

  it('shows a profile its address under its name', () => {
    render(<Profile />);

    expect(screen.getByText('ana@kroma.tv')).toBeTruthy();
  });

  it('shows a Kids session no address, since its own is only a placeholder', () => {
    app.user = KID;

    render(<Profile />);

    expect(screen.getByText('Léo')).toBeTruthy();
    expect(screen.queryByText('kids-kid@kroma.invalid')).toBeNull();
  });
});
