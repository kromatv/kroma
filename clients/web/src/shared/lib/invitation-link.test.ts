import { describe, expect, it } from 'vitest';
import { invitationLink } from '#web/shared/lib/invitation-link';

const HERE = 'http://localhost';
const SERVER_LINK = 'https://kroma.test/join/made-by-the-server';

describe('the address of an invitation', () => {
  it('is the one the server made for it', () => {
    expect(invitationLink({ url: SERVER_LINK, token: 't1' }, HERE)).toBe(SERVER_LINK);
  });

  it('is the join page of this address when the server made none', () => {
    expect(invitationLink({ url: null, token: 't1' }, HERE)).toBe(`${HERE}/join?invite=t1`);
  });

  it('is the join page of the page it is read on when no address is given', () => {
    expect(invitationLink({ url: null, token: 't1' })).toMatch(/\/join\?invite=t1$/);
  });
});
