// Empty-state + loading-placeholder primitives admin pages (built-in AND
// module-contributed) use as `<Suspense>` fallbacks and "nothing here" blocks.
//
// `EmptyState` is NOT here: the one in the repo is the design system's
// (@kroma/ui/kit); admin pages import it from there.
//
// The skeletons stay: they're DOM-and-Tailwind, sized with utility classes,
// the idiom of the admin tables they stand in for, which a React Native
// component can't express.

export { CardSkeleton, Skeleton, TableSkeleton } from './skeleton';
