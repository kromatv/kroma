// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KidsLook } from './kids-look.component';

const mocks = vi.hoisted(() => ({ useKidsLook: vi.fn(), user: { id: 'kid', kids: true } }));
vi.mock('@kromatv/ui/kit', () => ({ useKidsLook: mocks.useKidsLook }));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }));

afterEach(() => {
  cleanup();
  mocks.useKidsLook.mockReset();
});

describe('the Kids look', () => {
  it('dresses the app after the session that is signed in', () => {
    render(<KidsLook />);

    expect(mocks.useKidsLook).toHaveBeenCalledWith(mocks.user);
  });
});
