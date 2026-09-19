// The ball's footprint before the globe has loaded, and instead of it where
// WebGL is missing: the same 86% of the square the camera frames.
export function GlobeFrame() {
  return (
    <div aria-hidden className="aspect-square w-full p-[7%]">
      <div className="size-full rounded-full bg-surface-2/80 [mask-image:radial-gradient(circle_at_42%_36%,black_35%,transparent_100%)]" />
    </div>
  );
}
