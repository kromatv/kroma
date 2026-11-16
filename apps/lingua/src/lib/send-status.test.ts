import { describe, expect, it } from 'vitest';
import { sendLabel, sendStatus, type Work, worthShowing } from './send-status';

const PR = { number: 12, url: 'https://github.com/o/r/pull/12' };

function work(over: Partial<Work> = {}): Work {
  return { sending: { kind: 'idle' }, drafts: 0, proposed: 0, proposal: null, ...over };
}

describe('sendStatus', () => {
  it('says how many changes wait, and how sending works before the first pull request', () => {
    expect(sendStatus(work({ drafts: 3 }))).toEqual({
      title: '3 changes not sent yet',
      tone: 'text',
      detail: 'Sending opens a pull request from your fork, under your name.',
    });
  });

  it('says the pull request is open and how much waits in it', () => {
    expect(sendStatus(work({ proposed: 4, proposal: PR })).detail).toBe(
      'Pull request #12 is open, 4 changes waiting for a maintainer.',
    );
    expect(sendStatus(work({ proposal: PR })).detail).toBe(
      'Pull request #12 is open, waiting for a maintainer.',
    );
  });

  it('puts a refusal or a declined permission first', () => {
    expect(
      sendStatus(work({ drafts: 1, sending: { kind: 'failed', message: 'Busy' } })),
    ).toMatchObject({
      title: 'Not sent',
      tone: 'danger',
      detail: 'Busy',
    });
    expect(sendStatus(work({ sending: { kind: 'declined' } })).title).toBe(
      'GitHub did not give the permission',
    );
  });

  it('reports a send that went through, then a pull request with nothing left, then nothing', () => {
    expect(sendStatus(work({ sending: { kind: 'sent', number: 12 }, proposal: PR }))).toMatchObject(
      {
        title: 'Sent to pull request #12',
        tone: 'success',
      },
    );
    expect(sendStatus(work({ proposal: PR })).title).toBe('Everything is sent');
    expect(sendStatus(work()).title).toBe('No changes yet');
  });
});

describe('sendLabel', () => {
  it('counts the changes, and asks again after a declined permission', () => {
    expect(sendLabel(work({ drafts: 1 }))).toBe('Send 1 change');
    expect(sendLabel(work())).toBe('Send');
    expect(sendLabel(work({ sending: { kind: 'declined' } }))).toBe('Try again');
  });
});

describe('worthShowing', () => {
  it('shows the bar once there is work, a pull request, or a send to report', () => {
    expect(worthShowing(work())).toBe(false);
    expect(worthShowing(work({ drafts: 1 }))).toBe(true);
    expect(worthShowing(work({ proposal: PR }))).toBe(true);
    expect(worthShowing(work({ sending: { kind: 'declined' } }))).toBe(true);
  });
});
