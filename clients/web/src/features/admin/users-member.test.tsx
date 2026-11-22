// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { createStyleTestHost } from '@kromatv/ui/testing';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { member } from '#web/features/admin/users.fixture';
import { MemberIdentity } from '#web/features/admin/users-member.component';

const styleHost = createStyleTestHost();

afterEach(cleanup);

function show(locale: 'en' | 'fr', fields: Parameters<typeof member>[0]) {
  styleHost.render(
    <I18nProvider locale={locale}>
      <MemberIdentity user={member(fields)} />
    </I18nProvider>,
  );
}

describe('who a row of the member table is', () => {
  it('says that an account waits on an invitation that still works', () => {
    show('en', { invitation: 'pending' });

    expect(screen.getByText('Invitation pending')).toBeTruthy();
  });

  it('says that the invitation of a waiting account has expired', () => {
    show('en', { invitation: 'expired' });

    expect(screen.getByText('Invitation expired')).toBeTruthy();
  });

  it('says that a waiting account has no invitation to redeem', () => {
    show('fr', { invitation: 'none', email: null });

    expect(screen.getByText('Sans invitation')).toBeTruthy();
    expect(screen.getByText('Aucune adresse')).toBeTruthy();
  });

  it('marks nothing on an account its person signs in to', () => {
    show('en', { invitation: null });

    expect(screen.queryByText(/Invitation/)).toBeNull();
    expect(screen.getByText('lea@kroma.tv')).toBeTruthy();
  });
});
