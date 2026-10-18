// The two augmentation points that give the module system end-to-end types: a
// module merges into these from its own package via `declare module`.

/** Maps a module id to the API it exports for other modules to consume. */
// oxlint-disable-next-line typescript/no-empty-interface -- augmentation target.
export interface ModuleApiRegistry {}

/** Maps an event name to its payload type. */
// oxlint-disable-next-line typescript/no-empty-interface -- augmentation target.
export interface KromaEvents {}
