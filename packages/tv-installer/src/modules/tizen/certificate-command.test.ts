import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { certificateCommand } from './certificate-command';

const { exitAfter, duidAt, obtainCertificates } = vi.hoisted(() => ({
  exitAfter: vi.fn((work: number | Promise<number>) => work),
  duidAt: vi.fn(async (_host: string): Promise<string | null> => '1900A2C4D6E8'),
  obtainCertificates: vi.fn(async (_wish: unknown): Promise<unknown> => null),
}));
vi.mock('../../exit-after', () => ({ exitAfter }));
vi.mock('./duid', () => ({ duidAt }));
vi.mock('./samsung/obtain', () => ({ obtainCertificates }));

const obtained = {
  directory: '/home/.kroma/certificates/samsung',
  duids: ['1900A2C4D6E8'],
  authorUntil: new Date('2027-11-10T12:00:00Z'),
  distributorUntil: new Date('2027-11-11T12:00:00Z'),
};

const certificate = (host: string) =>
  (certificateCommand.run as (given: { args: { host: string } }) => Promise<number>)({
    args: { host },
  });

const printed: string[] = [];

beforeEach(() => {
  printed.length = 0;
  vi.spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
  duidAt.mockResolvedValue('1900A2C4D6E8');
  obtainCertificates.mockResolvedValue(obtained);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('certificateCommand', () => {
  it('asks Samsung for the certificates of the set it read the DUID off', async () => {
    const code = await certificate('192.168.1.31');

    expect(code).toBe(0);
    expect(duidAt).toHaveBeenCalledWith('192.168.1.31');
    expect(obtainCertificates.mock.calls[0]?.[0]).toMatchObject({ duid: '1900A2C4D6E8' });
  });

  it('says where the certificates are kept, for which sets, and until when', async () => {
    await certificate('192.168.1.31');

    const said = printed.join('\n');
    expect(said).toContain('192.168.1.31, DUID 1900A2C4D6E8');
    expect(said).toContain('/home/.kroma/certificates/samsung');
    expect(said).toContain('valid until 2027-11-10');
    expect(said).toContain('valid until 2027-11-11');
  });

  it('passes on what the request says while it runs', async () => {
    obtainCertificates.mockImplementation(async (wish) => {
      (wish as { log: (line: string) => void }).log('asking Samsung for an author certificate');
      return obtained;
    });

    await certificate('192.168.1.31');

    expect(printed.join('\n')).toContain('asking Samsung for an author certificate');
  });

  it('refuses a set that would not say its DUID, and asks Samsung nothing', async () => {
    duidAt.mockResolvedValue(null);

    await expect(certificate('192.168.1.31')).rejects.toThrow(
      '192.168.1.31 would not say its DUID',
    );
    expect(obtainCertificates).not.toHaveBeenCalled();
  });
});
