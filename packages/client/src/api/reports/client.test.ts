import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { ReportId } from './ids';

const report = ReportId.parse('rep1');
const CREATE = { subjectKind: 'movie' as const, subjectId: 'i1', category: 'audio' as const };

describe('the report endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'create',
      call: (c) => c.reports.create(CREATE),
      method: 'POST',
      path: '/reports',
      body: CREATE,
    },
    { name: 'mine', call: (c) => c.reports.mine(), method: 'GET', path: '/reports/mine' },
    {
      name: 'list',
      call: (c) => c.reports.list({ status: 'open' }),
      method: 'GET',
      path: '/admin/reports?status=open',
    },
    {
      name: 'list unfiltered',
      call: (c) => c.reports.list(),
      method: 'GET',
      path: '/admin/reports',
    },
    {
      name: 'resolve',
      call: (c) => c.reports.resolve(report),
      method: 'POST',
      path: '/admin/reports/rep1/resolve',
    },
    {
      name: 'dismiss',
      call: (c) => c.reports.dismiss(report),
      method: 'POST',
      path: '/admin/reports/rep1/dismiss',
    },
    {
      name: 'reopen',
      call: (c) => c.reports.reopen(report),
      method: 'POST',
      path: '/admin/reports/rep1/reopen',
    },
    {
      name: 'delete',
      call: (c) => c.reports.delete(report),
      method: 'DELETE',
      path: '/admin/reports/rep1',
    },
  ])('$name', checkEndpoint);
});
