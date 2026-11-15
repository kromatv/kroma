import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Television } from '../../shared/television';
import { eitherAuthor } from './either-author';
import { OtherAuthor } from './install-failure';
import type { SigningProfile } from './profiles';

const { duidAt, activeProfile, readSamsungProfile, coversSet } = vi.hoisted(() => ({
  duidAt: vi.fn(async (_host: string): Promise<string | null> => null),
  activeProfile: vi.fn(async (): Promise<SigningProfile | null> => null),
  readSamsungProfile: vi.fn((): SigningProfile | null => null),
  coversSet: vi.fn((_duid: string) => false),
}));
vi.mock('./duid', () => ({ duidAt }));
vi.mock('./profiles', () => ({ activeProfile }));
vi.mock('./samsung/profile', () => ({ readSamsungProfile, coversSet }));

const frame: Television = {
  host: '192.168.1.107',
  platform: 'tizen',
  vendor: 'Samsung',
  name: '75" The Frame',
  model: 'GQ75LS03DAUXZG',
  developerMode: 'on',
  sideloadable: true,
  note: 'developer mode on',
  runtime: null,
};

const issued: SigningProfile = {
  name: 'samsung',
  author: { key: '/kept/author.key', chain: '/kept/author.pem' },
};
const studio: SigningProfile = {
  name: 'KROMA',
  author: { archive: '/studio/kroma.p12', password: 'x' },
};
const salon: SigningProfile = {
  name: 'salon',
  author: { archive: '/studio/salon.p12', password: 'x' },
};

const otherAuthor = new OtherAuthor('another author signed the KROMA already on this set');
const lines: string[] = [];
const context = { tv: frame, log: (line: string) => void lines.push(line) };
const install = vi.fn(async (_profile: SigningProfile) => {});

const takes = (taken: SigningProfile) => async (profile: SigningProfile) => {
  if (profile !== taken) {
    throw otherAuthor;
  }
};

beforeEach(() => {
  lines.length = 0;
  install.mockReset();
  duidAt.mockReset();
  activeProfile.mockReset();
  readSamsungProfile.mockReset();
  coversSet.mockReset();
  duidAt.mockResolvedValue('1900A2C4D6E8');
  activeProfile.mockResolvedValue(null);
  readSamsungProfile.mockReturnValue(null);
  coversSet.mockReturnValue(true);
});

describe('eitherAuthor', () => {
  it('installs once, and changes nothing, when the set takes the profile chosen', async () => {
    readSamsungProfile.mockReturnValue(issued);
    activeProfile.mockResolvedValue(studio);

    const settled = await eitherAuthor(context, issued, install);

    expect(install.mock.calls).toEqual([[issued]]);
    expect(settled).toEqual({});
    expect(lines).toEqual([]);
  });

  it('signs again as the Tizen Studio profile for an app that profile installed', async () => {
    readSamsungProfile.mockReturnValue(issued);
    activeProfile.mockResolvedValue(studio);
    install.mockImplementation(takes(studio));

    const settled = await eitherAuthor(context, issued, install);

    expect(install.mock.calls).toEqual([[issued], [studio]]);
    expect(settled).toEqual({ profile: 'KROMA' });
  });

  it("goes back to Samsung's certificates, and to no named profile, for an app they installed", async () => {
    readSamsungProfile.mockReturnValue(issued);
    activeProfile.mockResolvedValue(studio);
    install.mockImplementation(takes(issued));

    const settled = await eitherAuthor(context, studio, install);

    expect(install.mock.calls).toEqual([[studio], [issued]]);
    expect(settled).toEqual({ profile: undefined });
    expect(coversSet).toHaveBeenCalledWith('1900A2C4D6E8');
  });

  it("skips Samsung's certificates when they do not list the set", async () => {
    readSamsungProfile.mockReturnValue(issued);
    activeProfile.mockResolvedValue(studio);
    coversSet.mockReturnValue(false);
    install.mockImplementation(takes(studio));

    const settled = await eitherAuthor(context, salon, install);

    expect(install.mock.calls).toEqual([[salon], [studio]]);
    expect(settled).toEqual({ profile: 'KROMA' });
  });

  it("skips Samsung's certificates when the set will not say which one it is", async () => {
    readSamsungProfile.mockReturnValue(issued);
    duidAt.mockRejectedValue(new Error('closed'));
    install.mockRejectedValue(otherAuthor);

    await expect(eitherAuthor(context, studio, install)).rejects.toBe(otherAuthor);

    expect(install).toHaveBeenCalledOnce();
  });

  it('says so before it signs again', async () => {
    readSamsungProfile.mockReturnValue(issued);
    activeProfile.mockResolvedValue(studio);
    install.mockImplementation(takes(studio));

    await eitherAuthor(context, issued, install);

    expect(lines).toEqual([
      "another author signed the KROMA on this set, trying this computer's other certificate",
    ]);
  });

  it('refuses as the set did when the profile chosen is the only one here', async () => {
    activeProfile.mockResolvedValue(studio);
    install.mockRejectedValue(otherAuthor);

    await expect(eitherAuthor(context, studio, install)).rejects.toBe(otherAuthor);

    expect(install).toHaveBeenCalledOnce();
    expect(lines).toEqual([]);
  });

  it('gives the first refusal when the other author is refused too', async () => {
    readSamsungProfile.mockReturnValue(issued);
    activeProfile.mockResolvedValue(studio);
    install
      .mockRejectedValueOnce(otherAuthor)
      .mockRejectedValueOnce(new Error('the set refused that chain'));

    await expect(eitherAuthor(context, issued, install)).rejects.toBe(otherAuthor);

    expect(install).toHaveBeenCalledTimes(2);
  });

  it('tries no other author for a refusal that is not about the author', async () => {
    readSamsungProfile.mockReturnValue(issued);
    activeProfile.mockResolvedValue(studio);
    install.mockRejectedValue(new Error('the install failed: INSTALL_ERROR [118]'));

    await expect(eitherAuthor(context, issued, install)).rejects.toThrow('the install failed');

    expect(install).toHaveBeenCalledOnce();
    expect(activeProfile).not.toHaveBeenCalled();
  });
});
