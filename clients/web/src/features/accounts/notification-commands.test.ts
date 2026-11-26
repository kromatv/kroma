import type { NotificationPrefs } from '@kromatv/client/notifications';
import type { Translate } from '@kromatv/i18n';
import { describe, expect, it, vi } from 'vitest';
import { notificationRows } from './notification-commands';

const t: Translate = (key: string, _vars?: unknown) => key;

const PREFS: NotificationPrefs = {
  categories: [
    { category: 'requests', inApp: true, push: true },
    { category: 'downloads', inApp: true, push: false },
  ],
  types: [
    {
      type: 'request.created',
      category: 'requests',
      label: 'New request',
      inApp: true,
      push: true,
    },
    {
      type: 'request.declined',
      category: 'requests',
      label: 'Request declined',
      inApp: true,
      push: false,
    },
  ],
};

const rowsFor = (prefs: NotificationPrefs | undefined, save = vi.fn(async () => {})) =>
  notificationRows(prefs, { t, save });

const row = (label: string, subtitle: string) =>
  rowsFor(PREFS).values.find((one) => one.label === label && one.subtitle === subtitle);

describe('the notification matrix in the command menu', () => {
  it('stands as one row that opens it on the account page', () => {
    expect(rowsFor(PREFS).head).toMatchObject({
      label: 'notifications.settings',
      to: '/account',
      search: { section: 'notifications' },
    });
  });

  it('offers no switch before the matrix has arrived', () => {
    expect(rowsFor(undefined).values).toEqual([]);
  });

  it('switches each category and each kind on each channel', () => {
    expect(rowsFor(PREFS).values.map((one) => [one.label, one.subtitle])).toEqual([
      ['notifications.category.requests', 'notifications.channelInApp'],
      ['New request', 'notifications.category.requests · notifications.channelInApp'],
      ['Request declined', 'notifications.category.requests · notifications.channelInApp'],
      ['notifications.category.requests', 'notifications.channelPush'],
      ['New request', 'notifications.category.requests · notifications.channelPush'],
      ['Request declined', 'notifications.category.requests · notifications.channelPush'],
      ['notifications.category.downloads', 'notifications.channelInApp'],
      ['notifications.category.downloads', 'notifications.channelPush'],
    ]);
  });

  it('says a category reaches only some of its kinds on a channel', () => {
    expect(row('notifications.category.requests', 'notifications.channelPush')?.status).toEqual({
      label: 'commands.partly',
      tone: 'neutral',
    });
  });

  it('moves a category and every kind under it with one row', async () => {
    const save = vi.fn(async () => {});
    const requestsPush = rowsFor(PREFS, save).values[3];

    await requestsPush?.run?.();

    expect(save).toHaveBeenCalledWith({
      categories: [{ category: 'requests', inApp: true, push: true }],
      types: [
        { type: 'request.created', inApp: true, push: true },
        { type: 'request.declined', inApp: true, push: true },
      ],
    });
  });

  it('sends one kind with both of its switches as they now stand', async () => {
    const save = vi.fn(async () => {});
    const declinedInApp = rowsFor(PREFS, save).values[2];

    await declinedInApp?.run?.();

    expect(save).toHaveBeenCalledWith({
      types: [{ type: 'request.declined', inApp: false, push: false }],
    });
  });

  it('is named by either channel', () => {
    expect(rowsFor(PREFS).words).toContain('notifications.channelPush');
  });
});
