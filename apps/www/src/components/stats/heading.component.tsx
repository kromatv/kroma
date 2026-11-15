export interface StatsHeadingProps {
  eyebrow: string;
  title: string;
  intro?: string;
}

export function StatsHeading({ eyebrow, title, intro }: Readonly<StatsHeadingProps>) {
  return (
    <div className="max-w-2xl">
      <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
        {eyebrow}
      </p>
      <h2 className="text-balance font-display text-3xl font-extrabold leading-[1.05] text-text sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">{intro}</p>}
    </div>
  );
}
