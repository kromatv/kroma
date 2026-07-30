import { Rich } from '#site/components/rich';

/** A heading whose amber span is marked inline in the message with brackets:
 *  `Six conteneurs. [Un seul serveur.]`. Each language brackets its own words, so
 *  a translator writes one whole sentence and no component has to reassemble a
 *  heading from three fragments. The bracket is read by <Rich>, the single parser
 *  every marker in the messages goes through, so a heading's amber and a codec's
 *  mono cannot drift apart. Returns the inline content only; the call site owns
 *  the h1/h2 and its type scale. */
export function AccentHeading({ text }: Readonly<{ text: string }>) {
  return <Rich>{text}</Rich>;
}

/** The eyebrow + display heading pair the asymmetric home bands share, where the
 *  header sits in one column of a grid rather than centred (the centred variant
 *  is <Section>'s own header). */
export function BandHeading({ eyebrow, heading }: Readonly<{ eyebrow: string; heading: string }>) {
  return (
    <>
      <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent">
        {eyebrow}
      </p>
      <h2 className="text-balance font-display text-3xl font-extrabold leading-[1.05] text-text sm:text-4xl">
        <AccentHeading text={heading} />
      </h2>
    </>
  );
}
