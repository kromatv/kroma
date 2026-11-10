import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtainCertificates } from './obtain';

const { run, signIn, requestCertificates } = vi.hoisted(() => ({
  run: vi.fn(async (_command: readonly string[]) => ({ code: 0, output: '' })),
  signIn: vi.fn(async (_open: (url: string) => void): Promise<unknown> => null),
  requestCertificates: vi.fn(async (_order: unknown): Promise<unknown> => null),
}));
vi.mock('../../../shared/run', () => ({ run }));
vi.mock('./sign-in', () => ({ signIn }));
vi.mock('./request', () => ({ requestCertificates }));

const access = { accessToken: 'token-123', userId: 'user-456', email: 'owner@example.com' };
const obtained = { directory: '/kept', duids: ['1900A2C4D6E8'] };
const SIGN_IN = 'https://account.samsung.com/mobile/account/check.do?serviceID=v285zxnl3h';

const running = process.platform;
const on = (platform: string) =>
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });

const lines: string[] = [];
const log = (line: string) => lines.push(line);

beforeEach(() => {
  lines.length = 0;
  signIn.mockImplementation(async (open) => {
    open(SIGN_IN);
    return access;
  });
  requestCertificates.mockResolvedValue(obtained);
  on('darwin');
});

afterEach(() => {
  on(running);
  vi.clearAllMocks();
});

describe('obtainCertificates', () => {
  it('orders the certificates of the set with the account that signed in', async () => {
    const answered = await obtainCertificates({ duid: '1900A2C4D6E8', log });

    expect(answered).toBe(obtained);
    expect(requestCertificates).toHaveBeenCalledWith({ access, duid: '1900A2C4D6E8', log });
  });

  it('opens the sign-in in the browser of a Mac, and says where to go without one', async () => {
    await obtainCertificates({ duid: '1900A2C4D6E8', log });

    expect(run).toHaveBeenCalledWith(['open', SIGN_IN]);
    expect(lines[0]).toBe(
      `sign in to your Samsung account in the browser. If none opened, go to: ${SIGN_IN}`,
    );
  });

  it('opens the sign-in with xdg-open on Linux', async () => {
    on('linux');

    await obtainCertificates({ duid: '1900A2C4D6E8', log });

    expect(run).toHaveBeenCalledWith(['xdg-open', SIGN_IN]);
  });

  it('only says the address on a system it knows no browser command for', async () => {
    on('freebsd');

    await obtainCertificates({ duid: '1900A2C4D6E8', log });

    expect(run).not.toHaveBeenCalled();
    expect(lines[0]).toContain(SIGN_IN);
  });

  it('carries on when the browser command is not there', async () => {
    run.mockRejectedValue(new Error('spawn open ENOENT'));

    expect(await obtainCertificates({ duid: '1900A2C4D6E8', log })).toBe(obtained);
  });
});
