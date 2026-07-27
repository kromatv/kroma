// The TEMPLATES: page-level skeletons, with no content of their own.
//
// A template decides where things GO. It carries no data, names no feature and
// would look identical whichever screen used it - which is exactly what makes it
// a template rather than an organism.
//
// There is one today, and it is the most load-bearing layout in the codebase:
// `<TvStage>` is the fixed 1920x1080 canvas every 10-foot screen is authored
// against, scaled to whatever the platform actually gives. It is why one set of
// numbers is correct on a Samsung panel, an Apple TV and an Android TV whose dp
// units disagree wildly.
//
// PAGES - the level above this - are deliberately NOT here. A page is a template
// filled with real data, which means it knows about the server, the router and
// the session: that is an app concern, and it lives in the app packages
// (`packages/tv/src/features/*`, `clients/*/src`). A design system that shipped
// pages would be shipping the product.

export type { TvStageProps } from './tv-stage';
export { TvStage } from './tv-stage';
