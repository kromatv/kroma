import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { JobKey, JobRunId } from './ids';

const job = JobKey.parse('library.scan');

describe('the job endpoints', () => {
  it.each<Endpoint>([
    { name: 'list', call: (c) => c.jobs.list(), method: 'GET', path: '/admin/jobs' },
    {
      name: 'detail',
      call: (c) => c.jobs.detail(job),
      method: 'GET',
      path: '/admin/jobs/library.scan',
    },
    {
      name: 'run',
      call: (c) => c.jobs.run(job),
      method: 'POST',
      path: '/admin/jobs/library.scan/run',
    },
    {
      name: 'cancel',
      call: (c) => c.jobs.cancel(job),
      method: 'POST',
      path: '/admin/jobs/library.scan/cancel',
    },
    {
      name: 'update',
      call: (c) => c.jobs.update(job, { enabled: false }),
      method: 'PATCH',
      path: '/admin/jobs/library.scan',
      body: { enabled: false },
    },
    {
      name: 'runLogs',
      call: (c) => c.jobs.runLogs(JobRunId.parse('run 1')),
      method: 'GET',
      path: '/admin/job-runs/run%201/logs',
    },
  ])('$name', checkEndpoint);
});
