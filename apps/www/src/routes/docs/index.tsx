import { createFileRoute, notFound } from '@tanstack/react-router';
import { DocPage } from '#site/components/docs/doc-page';
import { getDoc } from '#site/lib/doc-pages';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';

export const Route = createFileRoute('/docs/')({
  loader: () => {
    const doc = getDoc('index', getLocale());
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
          markdown: loaderData.meta.markdown,
        })
      : {},
  component: () => <DocPage slug="index" />,
});
