import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { certificateCommand } from './certificate-command';

const { exitAfter, reach, duidOf, signIn, requestCertificates, run } = vi.hoisted(() => ({
  exitAfter: vi.fn((work: number | Promise<number>) => work),
  reach: vi.fn(async (_host: string): Promise<unknown> => null),
  duidOf: vi.fn(async (_device: unknown): Promise<string | null> => '1900A2C4D6E8'),
  signIn: vi.fn(async (_open: (url: string) => void): Promise<unknown> => null),
  requestCertificates: vi.fn(async (_order: unknown): Promise<unknown> => null),
  run: vi.fn(async (_command: readonly string[]) => ({ code: 0, output: '' })),
}));
vi.mock('../../exit-after', () => ({ exitAfter }));
vi.mock('../../run', () => ({ run }));
vi.mock('./reach', () => ({ reach }));
vi.mock('./duid', () => ({ duidOf }));
vi.mock('./samsung/sign-in', () => ({ signIn }));
vi.mock('./samsung/request', () => ({ requestCertificates }));

const access = { accessToken: 'token-123', userId: 'user-456', email: 'owner@example.com' };
const close = vi.fn();
const SIGN_IN = 'https://account.samsung.com/mobile/account/check.do?serviceID=v285zxnl3h';

const certificate = (host: string) =>
  (certificateCommand.run as (given: { args: { host: string } }) => Promise<number>)({
    args: { host },
  });

const running = process.platform;
const on = (platform: string) =>
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });

const printed: string[] = [];

beforeEach(() => {
  printed.length = 0;
  vi.spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
  reach.mockResolvedValue({ close });
  duidOf.mockResolvedValue('1900A2C4D6E8');
  signIn.mockImplementation(async (open) => {
    open(SIGN_IN);
    return access;
  });
  requestCertificates.mockResolvedValue({
    directory: '/home/.kroma/certificates/samsung',
    duids: ['1900A2C4D6E8'],
    authorUntil: new Date('2027-11-10T12:00:00Z'),
    distributorUntil: new Date('2027-11-11T12:00:00Z'),
  });
  on('darwin');
});

afterEach(() => {
  on(running);
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('certificateCommand', () => {
  it('asks Samsung for the certificates of the set it read the DUID off', async () => {
    const code = await certificate('192.168.1.31');

    expect(code).toBe(0);
    expect(reach).toHaveBeenCalledWith('192.168.1.31');
    expect(requestCertificates.mock.calls[0]?.[0]).toMatchObject({ access, duid: '1900A2C4D6E8' });
  });

  it('lets go of the set before anyone signs in, since it takes one connection', async () => {
    signIn.mockImplementation(async () => {
      expect(close).toHaveBeenCalledOnce();
      return access;
    });

    await certificate('192.168.1.31');

    expect(signIn).toHaveBeenCalledOnce();
  });

  it('opens the sign-in in the browser of a Mac, and prints where to go without one', async () => {
    await certificate('192.168.1.31');

    expect(run).toHaveBeenCalledWith(['open', SIGN_IN]);
    expect(printed.join('\n')).toContain(`If none opened, go to:\n${SIGN_IN}`);
  });

  it('opens the sign-in with xdg-open on Linux', async () => {
    on('linux');

    await certificate('192.168.1.31');

    expect(run).toHaveBeenCalledWith(['xdg-open', SIGN_IN]);
  });

  it('only prints the address on a system it knows no browser command for', async () => {
    on('freebsd');

    await certificate('192.168.1.31');

    expect(run).not.toHaveBeenCalled();
  });

  it('carries on when the browser command is not there', async () => {
    run.mockRejectedValue(new Error('spawn open ENOENT'));

    expect(await certificate('192.168.1.31')).toBe(0);
  });

  it('says where the certificates are kept, for which sets, and until when', async () => {
    await certificate('192.168.1.31');

    const said = printed.join('\n');
    expect(said).toContain('192.168.1.31, DUID 1900A2C4D6E8');
    expect(said).toContain('/home/.kroma/certificates/samsung');
    expect(said).toContain('valid until 2027-11-10');
    expect(said).toContain('valid until 2027-11-11');
  });

  it('passes on what the order says while it runs', async () => {
    requestCertificates.mockImplementation(async (order) => {
      (order as { log: (line: string) => void }).log('asking Samsung for an author certificate');
      return {
        directory: '/home/.kroma/certificates/samsung',
        duids: ['1900A2C4D6E8'],
        authorUntil: new Date('2027-11-10T12:00:00Z'),
        distributorUntil: new Date('2027-11-11T12:00:00Z'),
      };
    });

    await certificate('192.168.1.31');

    expect(printed.join('\n')).toContain('asking Samsung for an author certificate');
  });

  it('refuses a set that would not say its DUID, and lets go of it', async () => {
    duidOf.mockResolvedValue(null);

    await expect(certificate('192.168.1.31')).rejects.toThrow(
      '192.168.1.31 would not say its DUID',
    );
    expect(close).toHaveBeenCalledOnce();
    expect(signIn).not.toHaveBeenCalled();
  });
});
