// The Metro mirror of `stories.web.ts`. Metro cannot hand a module its own
// text, so there is no `?raw` half here and a demo renders without its code
// panel. A `.docs.mdx` is not that case: Metro compiles it to a component
// through @kroma/bundler's mdx-transformer, so the prose is whole.
//
// Nor is there a lazy half. `require.context` puts every matched module in the
// bundle whatever is done with it, so deferring the CALL buys a phone nothing
// and costs it the one thing the web half gains: there is no chunk to not
// download. The registry is compiled here and handed over as an index that is
// already `ready()`, so the shell reads one shape on both bundlers.

import { discoverMetro, discoverPagesMetro, storyEntries, withPageHistory } from '@kroma/workbench';

declare const require: {
  context(
    directory: string,
    useSubdirectories: boolean,
    regExp: RegExp,
  ): { keys(): string[]; <T>(id: string): T };
};

export const STORIES = storyEntries(
  discoverMetro(require.context('../../../packages/ui/src', true, /\.demo\.tsx$|\.story\.mdx$/)),
);

// The guides are the SITE's, not the kit's: they are writing about the design
// system rather than part of it, so they live here and are found here.
export const PAGES = withPageHistory(
  discoverPagesMetro(require.context('./guides', true, /\.page\.mdx$/)),
);
