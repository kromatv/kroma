import { Image } from '#web/shared/ui';

/** Layered backdrop + scrims for the cinematic `DetailHero`. Overlays text on an
 * *unknown* key-art image, so legibility can't assume dark art: each layer fades
 * over a long, soft distance instead of a hard edge, keeping the art visible. */
export function HeroBackdrop({
  backdrop,
  gradient,
}: Readonly<{ backdrop: string | null; gradient: string }>) {
  return (
    <>
      <Image src={backdrop} fit="cover" background={gradient} fill priority />
      <div className="absolute inset-0 bg-[radial-gradient(125%_125%_at_80%_22%,transparent_38%,var(--kroma-bg)_94%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--kroma-bg)_0%,color-mix(in_srgb,var(--kroma-bg)_74%,transparent)_22%,color-mix(in_srgb,var(--kroma-bg)_34%,transparent)_46%,color-mix(in_srgb,var(--kroma-bg)_8%,transparent)_64%,transparent_80%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--kroma-bg)_3%,transparent_46%)]" />
      {/* Reading frost light + wide so the backdrop still reads through. Below md
          the rem mask would cover the whole viewport, so use %-stops there. */}
      <div
        className="absolute inset-0 backdrop-blur-[2px]
          bg-[linear-gradient(to_top,color-mix(in_srgb,var(--kroma-bg)_58%,transparent)_0%,color-mix(in_srgb,var(--kroma-bg)_34%,transparent)_100%)]
          mask-[linear-gradient(90deg,#000_0%,#000_35%,transparent_100%)]
          md:mask-[linear-gradient(90deg,#000_0rem,#000_22rem,transparent_68rem)]"
      />
    </>
  );
}
