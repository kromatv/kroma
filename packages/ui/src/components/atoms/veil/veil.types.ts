export interface VeilProps {
  /** One or more CSS `linear-gradient(...)`, comma-separated, the first on top:
   *  what `background-image` takes. Smooth ramps only: the browser targets draw
   *  it once into a small bitmap and stretch that over the box. */
  ramp: string;
}
