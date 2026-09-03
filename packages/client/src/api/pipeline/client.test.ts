import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { ItemId, ShowId } from '../media';

const item = ItemId.parse('i 1');
const show = ShowId.parse('s1');

describe('the pipeline endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'overview',
      call: (c) => c.pipeline.overview(),
      method: 'GET',
      path: '/admin/pipeline',
    },
    {
      name: 'failed',
      call: (c) => c.pipeline.failed('probe'),
      method: 'GET',
      path: '/admin/pipeline/probe/failed',
    },
    {
      name: 'run',
      call: (c) => c.pipeline.run('probe'),
      method: 'POST',
      path: '/admin/pipeline/probe/run',
    },
    {
      name: 'cancel',
      call: (c) => c.pipeline.cancel('probe'),
      method: 'POST',
      path: '/admin/pipeline/probe/cancel',
    },
    {
      name: 'pause, which holds every stage at once',
      call: (c) => c.pipeline.pause(true),
      method: 'POST',
      path: '/admin/pipeline/pause',
      body: { paused: true },
    },
    {
      name: 'retry',
      call: (c) => c.pipeline.retry('probe'),
      method: 'POST',
      path: '/admin/pipeline/probe/retry',
    },
    {
      name: 'reprocess',
      call: (c) => c.pipeline.reprocess('probe'),
      method: 'POST',
      path: '/admin/pipeline/probe/reprocess',
    },
    {
      name: 'retryTask',
      call: (c) => c.pipeline.retryTask('probe', item),
      method: 'POST',
      path: '/admin/pipeline/probe/task/retry',
      body: { subjectId: 'i 1' },
    },
    {
      name: 'elements',
      call: (c) => c.pipeline.elements({ status: 'failed', page: 2 }),
      method: 'GET',
      path: '/admin/pipeline/elements?status=failed&page=2',
    },
    {
      name: 'elements unfiltered',
      call: (c) => c.pipeline.elements(),
      method: 'GET',
      path: '/admin/pipeline/elements',
    },
    {
      name: 'retryElement',
      call: (c) => c.pipeline.retryElement('item', item, 'probe'),
      method: 'POST',
      path: '/admin/pipeline/element/retry',
      body: { kind: 'item', id: 'i 1', stage: 'probe' },
    },
    {
      name: 'item',
      call: (c) => c.pipeline.item(item),
      method: 'GET',
      path: '/admin/pipeline/item/i%201',
    },
    {
      name: 'show',
      call: (c) => c.pipeline.show(show),
      method: 'GET',
      path: '/admin/pipeline/show/s1',
    },
    {
      name: 'reprocessSubject',
      call: (c) => c.pipeline.reprocessSubject('show', show),
      method: 'POST',
      path: '/admin/pipeline/subject/reprocess',
      body: { kind: 'show', id: 's1' },
    },
  ])('$name', checkEndpoint);
});
