import { Image } from '@kroma/admin-kit';

/** Layered backdrop + scrims for the cinematic `DetailHero`. Overlays text on an
 * *unknown* key-art image, so legibility can't assume dark art: each layer fades
 * over a long, soft distance instead of a hard edge, keeping the art visible. */
export function HeroBackdrop({
  backdrop,
  gradient,
}: Readonly<{ backdrop: string | null; gradient: string }>) {
  return (
    <>
      <Image src={backdrop} fit="cover" background={gradient} fill />
      <div className="absolute inset-0 bg-[radial-gradient(125%_125%_at_80%_22%,transparent_38%,var(--kroma-bg)_94%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--kroma-bg)_0%,rgba(10,10,12,.74)_22%,rgba(10,10,12,.34)_46%,rgba(10,10,12,.08)_64%,transparent_80%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--kroma-bg)_3%,transparent_46%)]" />
      {/* Reading frost light + wide so the backdrop still reads through. Below md
          the rem mask would cover the whole viewport, so use %-stops there. */}
      <div
        className="absolute inset-0 backdrop-blur-[2px]
          bg-[linear-gradient(to_top,rgba(10,10,12,.58)_0%,rgba(10,10,12,.34)_100%)]
          mask-[linear-gradient(90deg,#000_0%,#000_35%,transparent_100%)]
          md:mask-[linear-gradient(90deg,#000_0rem,#000_22rem,transparent_68rem)]"
      />
    </>
  );
}
