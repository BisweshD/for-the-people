import { cn } from "@/lib/utils";

/** The heading block shared by the trust pages: a plain-sentence title and one line of context. */
export function PageHeader({
  title,
  lede,
  className,
  children,
}: {
  title: string;
  lede: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("flex max-w-3xl flex-col gap-3", className)}>
      <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-ink md:text-5xl">
        {title}
      </h1>
      <p className="text-lg text-ink-2">{lede}</p>
      {children}
    </header>
  );
}

/** A section of long reading: a sans heading over Source Serif body text, capped at 65 characters a line. */
export function ProseSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-4">
      <h2 id={`${id}-title`} className="text-2xl font-bold text-ink md:text-3xl">
        {title}
      </h2>
      <div className="flex max-w-[65ch] flex-col gap-4 font-serif text-lg leading-[1.6] text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
