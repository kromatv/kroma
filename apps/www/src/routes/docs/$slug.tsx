import { createFileRoute, notFound, useParams } from '@tanstack/react-router';
import { DocPage } from '#site/components/docs/doc-page';
import { getDoc } from '#site/lib/doc-pages';
import { isDocSlug } from '#site/lib/docs';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';

export const Route = createFileRoute('/docs/$slug')({
  loader: ({ params }) => {
    const doc = params.slug === 'index' ? undefined : getDoc(params.slug, getLocale());
    if (!doc) throw notFound();
    const { Component: _Component, ...meta } = doc;
    return { meta };
  },
  head: ({ loaderData }) =>
    loaderData
      ? seo({
          lang: getLocale(),
          title: loaderData.meta.title,
          description: loaderData.meta.description,
          path: loaderData.meta.path,
          type: 'article',
        })
      : {},
  component: Guide,
});

function Guide() {
  const slug = useParams({ strict: false }).slug;
  return slug && isDocSlug(slug) ? <DocPage slug={slug} /> : null;
}
