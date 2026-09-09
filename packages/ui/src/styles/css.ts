// What `@kromatv/ui/css` resolves to when nothing served it. `kromaUI()` claims
// the specifier before Vite's resolver reaches this package's exports map, so
// reaching this file at all means the plugin is not in the pipeline - and the
// page it was imported from would otherwise have painted with every custom
// property undefined.

export {};

throw new Error(
  '[kroma-ui] @kromatv/ui/css was imported, but kromaUI() is not in the Vite plugin list, so no stylesheet was served. Add it (see @kromatv/ui/vite).',
);
