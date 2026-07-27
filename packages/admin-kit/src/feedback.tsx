// Empty-state + loading-placeholder primitives admin pages (built-in AND
// module-contributed) use as `<Suspense>` fallbacks and "nothing here" blocks.
//
// `EmptyState` is NOT here: there is one in the whole repo, the design system's
// (@kroma/ui/kit), and admin pages import it from there like everything else.
//
// The skeletons stay. They are DOM-and-Tailwind: sized with utility classes,
// which is the idiom of the admin tables they stand in for and not something a
// React Native component can express (there is no className). `CardSkeleton` and
// `TableSkeleton` are admin LAYOUTS rather than primitives, which is the other
// reason they belong to this contract instead of to the kit.

export { CardSkeleton, Skeleton, TableSkeleton } from './skeleton';
