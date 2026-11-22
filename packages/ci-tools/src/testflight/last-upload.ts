import { z } from 'zod';
import { githubGet } from '../changed-files';
import type { Repo } from '../event';

const UPLOAD_STEP = 'Upload to TestFlight';
const RUNS_LOOKED_AT = 60;

const Runs = z.object({
  workflow_runs: z.array(
    z.object({ id: z.number().int(), head_sha: z.string().regex(/^[0-9a-f]{40}$/) }),
  ),
});

const Jobs = z.object({
  jobs: z.array(
    z.object({
      name: z.string(),
      steps: z.array(z.object({ name: z.string(), conclusion: z.string().nullable() })).default([]),
    }),
  ),
});

type JobList = z.infer<typeof Jobs>['jobs'];

/** Whether a run's jobs include `job` with a TestFlight upload that went through. */
export function uploadedIn(jobs: JobList, job: string): boolean {
  return jobs.some(
    (j) =>
      (j.name === job || j.name.endsWith(` / ${job}`)) &&
      j.steps.some((step) => step.name === UPLOAD_STEP && step.conclusion === 'success'),
  );
}

/**
 * The commit of the newest finished Build & Release run on main whose `job`
 * uploaded to TestFlight, or null when none of the last runs did.
 */
export async function lastUpload(repo: Repo, job: string): Promise<string | null> {
  const runs = Runs.parse(
    await githubGet(
      repo,
      `/actions/workflows/release.yml/runs?branch=main&status=completed&per_page=${RUNS_LOOKED_AT}`,
    ),
  );
  const first = async (index: number): Promise<string | null> => {
    const run = runs.workflow_runs[index];
    if (!run) {
      return null;
    }
    const { jobs } = Jobs.parse(await githubGet(repo, `/actions/runs/${run.id}/jobs?per_page=100`));
    return uploadedIn(jobs, job) ? run.head_sha : first(index + 1);
  };
  return first(0);
}
