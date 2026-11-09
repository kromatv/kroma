import { createDocs, type DocModule } from '#site/lib/docs';

export const { getDoc, listed, neighbours } = createDocs(
  {
    ...import.meta.glob<DocModule>('../../../../docs/setup/*.md', { eager: true }),
    ...import.meta.glob<DocModule>('../../content/docs/*.md', { eager: true }),
  },
  'apps/www/src/lib',
);
