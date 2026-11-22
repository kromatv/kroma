import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastUpload, uploadedIn } from './last-upload';

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));
vi.mock('bun', () => ({ $: vi.fn() }));

const JOB = 'Mobile .ipa (TestFlight)';
const repo = { slug: 'kromatv/kroma', token: 'token' };
const sha = (c: string) => c.repeat(40);

const job = (name: string, upload: string | null) => ({
  name,
  steps: [
    { name: 'Validate for the App Store', conclusion: 'success' },
    { name: 'Upload to TestFlight', conclusion: upload },
  ],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadedIn', () => {
  it("finds the upload inside the called workflow's job", () => {
    expect(uploadedIn([job(`Mobile / ${JOB}`, 'success')], JOB)).toBe(true);
  });

  it('does not count an upload that was skipped, failed, or made by another app', () => {
    const jobs = [
      job(`Mobile / ${JOB}`, 'skipped'),
      job('Apple TV / Apple TV .ipa (TestFlight)', 'success'),
    ];

    expect(uploadedIn(jobs, JOB)).toBe(false);
    expect(uploadedIn([job(`Mobile / ${JOB}`, 'failure')], JOB)).toBe(false);
  });
});

describe('lastUpload', () => {
  it('walks back to the newest run whose upload went through', async () => {
    const answers: Record<string, unknown> = {
      runs: {
        workflow_runs: [
          { id: 3, head_sha: sha('c') },
          { id: 2, head_sha: sha('b') },
        ],
      },
      3: { jobs: [job(`Mobile / ${JOB}`, 'skipped')] },
      2: { jobs: [job(`Mobile / ${JOB}`, 'success')] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const run = /runs\/(\d+)\/jobs/.exec(url)?.[1] ?? 'runs';
        return Response.json(answers[run]);
      }),
    );

    expect(await lastUpload(repo, JOB)).toBe(sha('b'));
  });

  it('is null when no recent run uploaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ workflow_runs: [] })),
    );

    expect(await lastUpload(repo, JOB)).toBeNull();
  });
});
