import { IconArrowRight } from '@tabler/icons-react';
import { Container } from '#site/components/container';
import { BandHeading } from '#site/components/home/heading';
import { L } from '#site/components/localized-link';
import { useLang } from '#site/lib/i18n';
import { getAllPosts } from '#site/lib/posts';
import { m } from '#site/paraglide/messages';

// Renders nothing when the blog is empty: a "coming soon" placeholder on the
// home page would read as unfinished, which is worse than absence.
export function BlogTeaser() {
  const lang = useLang();
  const posts = getAllPosts(lang).slice(0, 2);
  if (posts.length === 0) return null;

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <BandHeading
              eyebrow={m.home_blog_teaser_eyebrow()}
              heading={m.home_blog_teaser_heading()}
            />
          </div>
          <L
            to="/blog"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-accent"
          >
            {m.home_blog_teaser_all()}
            <IconArrowRight
              size={16}
              stroke={2}
              aria-hidden
              className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
            />
          </L>
        </div>

        <div className={`mt-10 grid gap-4 ${posts.length === 1 ? '' : 'md:grid-cols-2'}`}>
          {posts.map((post) => (
            <L
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="group flex flex-col rounded-2xl border border-border bg-surface-1/40 p-6 transition-colors duration-200 hover:border-border-strong hover:bg-surface-1 sm:p-8"
            >
              {post.tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <h3 className="font-display text-xl font-bold leading-snug text-text transition-colors group-hover:text-accent sm:text-2xl">
                {post.title}
              </h3>
              {post.excerpt && (
                <p className="mt-3 flex-1 text-pretty leading-relaxed text-muted">{post.excerpt}</p>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs text-dim">
                <span>{post.author}</span>
                <span aria-hidden>·</span>
                <time dateTime={post.date}>{post.dateLabel}</time>
                <span aria-hidden>·</span>
                <span>
                  {post.readingMinutes} {m.blog_reading_suffix()}
                </span>
              </div>
            </L>
          ))}
        </div>
      </Container>
    </section>
  );
}
