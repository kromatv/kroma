// @vitest-environment jsdom

import type { PersonHit } from '@kromatv/client/media';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => ({ push: vi.fn(), resolve: vi.fn() }));

vi.mock('expo-router', () => ({ useRouter: () => ({ push: app.push }) }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@gorhom/bottom-sheet', () => ({}));
vi.mock('#mobile/lib/i18n', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    [key, ...Object.values(vars ?? {})].join(' '),
}));
vi.mock('#mobile/lib/session', () => ({
  useClient: () => ({ media: { artwork: { resolve: app.resolve } } }),
}));

const { PeopleStrip } = await import('./people-strip');

const person = (over: Partial<PersonHit> = {}): PersonHit => ({
  name: 'Michael Mann',
  titles: 3,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  app.resolve.mockReturnValue(null);
});
afterEach(cleanup);

describe('the people a search matched', () => {
  it('shows each name with how many titles credit it', () => {
    render(<PeopleStrip people={[person(), person({ name: 'Al Pacino', titles: 12 })]} />);

    expect(screen.getByText('search.people')).toBeTruthy();
    expect(screen.getByText('Michael Mann')).toBeTruthy();
    expect(screen.getByText('person.titleCount 3')).toBeTruthy();
    expect(screen.getByText('person.titleCount 12')).toBeTruthy();
  });

  it('asks for a portrait at the size it is drawn', () => {
    render(<PeopleStrip people={[person({ profileUrl: '/api/images/mann.webp' })]} />);

    expect(app.resolve).toHaveBeenCalledWith('/api/images/mann.webp', 320);
  });

  it('opens the credits of the person tapped, whatever their name holds', () => {
    render(<PeopleStrip people={[person({ name: 'Zoë Kravitz / Lola' })]} />);

    fireEvent.click(screen.getByText('Zoë Kravitz / Lola'));

    expect(app.push).toHaveBeenCalledWith('/person/Zo%C3%AB%20Kravitz%20%2F%20Lola');
  });

  it('draws nothing for a search that matched nobody', () => {
    const { container } = render(<PeopleStrip people={[]} />);

    expect(container.textContent).toBe('');
  });
});
