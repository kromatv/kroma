import { Rich } from '#site/components/rich';

export function AccentHeading({ text }: Readonly<{ text: string }>) {
  return <Rich>{text}</Rich>;
}

export function BandHeading({ eyebrow, heading }: Readonly<{ eyebrow: string; heading: string }>) {
  return (
    <>
      <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
        {eyebrow}
      </p>
      <h2 className="text-balance font-display text-3xl font-extrabold leading-[1.05] text-text sm:text-4xl">
        <AccentHeading text={heading} />
      </h2>
    </>
  );
}
