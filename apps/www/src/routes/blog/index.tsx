import { createFileRoute } from '@tanstack/react-router';
import { Container } from '#site/components/container';
import { L } from '#site/components/localized-link';
import { getLocale, useLang } from '#site/lib/i18n';
import { getAllPosts } from '#site/lib/posts';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/blog/')({
  head: () =>
    seo({
      lang: getLocale(),
      title: m.blog_head_title(),
      description: m.blog_head_description(),
      path: '/blog',
    }),
  component: BlogIndex,
});

function BlogIndex() {
  const lang = useLang();
  const posts = getAllPosts(lang);

  return (
    <Container>
      <div className="py-20 sm:py-28">
        <header className="max-w-2xl">
          <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
            {m.blog_eyebrow()}
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] text-text sm:text-5xl">
            {m.blog_heading()}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">{m.blog_intro()}</p>
        </header>

        {posts.length === 0 ? (
          <p className="mt-16 text-muted">{m.blog_empty()}</p>
        ) : (
          <ul className="mt-14 flex flex-col divide-y divide-border/70 border-y border-border/70">
            {posts.map((post) => (
              <li key={post.slug}>
                <L
                  to={`/blog/${post.slug}`}
                  className="group grid gap-4 py-8 transition-colors sm:grid-cols-[10rem_1fr] sm:gap-8"
                >
                  <div className="text-sm text-dim">
                    <time dateTime={post.date}>{post.dateLabel}</time>
                    <p className="mt-1">
                      {post.readingMinutes} {m.blog_reading_suffix()}
                    </p>
                  </div>
                  <div>
                    {post.tags.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {post.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-text"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <h2 className="font-display text-2xl font-bold leading-snug text-text transition-colors group-hover:text-accent-text">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-muted">
                        {post.excerpt}
                      </p>
                    )}
                    <p className="mt-3 text-sm text-dim">
                      {m.blog_by()} {post.author}
                    </p>
                  </div>
                </L>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
