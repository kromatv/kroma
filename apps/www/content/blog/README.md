# Writing a post

The blog is a folder of `.mdx` files. To publish, drop one in. Nothing else
to touch: no route to add, no index to update, no config.

```bash
# The file name IS the URL (the "slug").
# content/blog/my-post.mdx  ->  https://kroma.tv/blog/my-post
touch content/blog/my-post.mdx
```

At the next `bun run build` the post is discovered, prerendered to static HTML,
dated, sorted newest first, and its reading time is computed for you.

## Two languages, one naming convention

English is the default language, so the base file is English and other languages
are `.<lang>.mdx` overrides of the same slug:

```
my-post.mdx        the default version (English), the fallback
my-post.fr.mdx     the French translation of the same post
```

- A reader always gets the post: the translation for their language if it exists,
  otherwise the English default, never a missing page.
- Both `/blog/my-post` and `/fr/blog/my-post` resolve, and the language switcher
  lines up because the slug is shared.
- A translation's frontmatter is optional and inherits from the default file,
  so `my-post.fr.mdx` can carry just `title` + `excerpt` + the prose and reuse the
  default's `date`, `tags` and `cover`.

## Frontmatter

A YAML block between `---`. Only `title` is truly required, but fill them in:
they feed the list, the article page and the social (Open Graph) card.

```mdx
---
title: "The post title"                 # required
date: "2026-01-14"                        # YYYY-MM-DD, drives sorting + display
excerpt: "One sentence, shown in the list and the social card."
author: "Your name"
tags: ["Announcement", "Behind the scenes"]
cover: "/blog/my-post/cover.jpg"          # optional social-card image
draft: false                              # true = visible in dev, hidden in the build
---

Your content starts here. It is Markdown, plus MDX when you need it.
```

## What you can write

Standard Markdown, plus the extras already wired: GFM (tables, task lists),
anchored headings (`rehype-slug`), Shiki-highlighted code blocks in the charcoal
theme, and React components (it is MDX). Article styling comes from the
`.prose-kroma` wrapper, so just write the content.

## Preview

```bash
bun run --filter '@kroma/site' dev      # http://localhost:3100/blog
```

Drafts are visible in dev and hidden in the production build. That's it: writing
a post is writing a file.
