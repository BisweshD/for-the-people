import { ChevronDown } from "lucide-react";
import { createElement } from "react";
import { READING_CLASS, SummaryBlocks } from "@/components/bills/crs-summary";
import { shortHeading, type SummarySection } from "@/lib/summary-sections";
import { cn } from "@/lib/utils";

/**
 * The full CRS summary as closed sections: its titles (or divisions), and inside each its subtitles,
 * every one with the CRS's own one-line description when it has one. Deeper parts and chapters read
 * as headings inside an open section. Every word of the summary is in the page, so find-in-page and
 * screen readers reach all of it.
 */

type Level = 2 | 3 | 4 | 5 | 6;
const tag = (level: number) => `h${Math.min(level, 6) as Level}` as const;

/** A heading at a computed level (h2 to h6). */
function Heading({ level, ...props }: { level: number } & React.ComponentProps<"h2">) {
  return createElement(tag(level), props);
}

/** "Title I: Committee on Agriculture" with the division label set quieter than its name. */
function HeadingText({ heading }: { heading: string }) {
  const split = heading.indexOf(": ");
  if (split < 0) return heading;
  return (
    <>
      <span className="text-ink-2">{heading.slice(0, split + 1)}</span> {heading.slice(split + 2)}
    </>
  );
}

function Body({ section, depth }: { section: SummarySection; depth: number }) {
  return (
    <>
      {section.blocks.length > 0 && (
        <div className={READING_CLASS}>
          <SummaryBlocks blocks={section.blocks} heading={tag(depth + 3)} />
        </div>
      )}
      {section.children.length > 0 &&
        (depth === 0 ? (
          <ul className="flex flex-col border-b border-hairline">
            {section.children.map((child) => (
              <li key={child.id}>
                <Disclosure section={child} depth={1} />
              </li>
            ))}
          </ul>
        ) : (
          section.children.map((child) => (
            <Inline key={child.id} section={child} depth={depth + 1} />
          ))
        ))}
    </>
  );
}

/** A part or chapter inside an open subtitle: a plain heading and its text. */
function Inline({ section, depth }: { section: SummarySection; depth: number }) {
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-heading`}
      className="flex scroll-mt-12 flex-col gap-4 pt-2 xl:scroll-mt-0"
    >
      <Heading
        level={depth + 2}
        id={`${section.id}-heading`}
        className="font-sans text-base leading-snug font-bold text-ink"
      >
        <HeadingText heading={section.heading} />
      </Heading>
      <Body section={section} depth={depth} />
    </section>
  );
}

/**
 * Each level names its own group, so an open title never turns the chevrons or hides the gists of the
 * subtitles inside it.
 */
const OPEN = {
  0: { group: "group/top", chevron: "group-open/top:rotate-180", gist: "group-open/top:hidden" },
  1: { group: "group/sub", chevron: "group-open/sub:rotate-180", gist: "group-open/sub:hidden" },
} as const;

/**
 * A title is named one way down the page, as the rail and the chart name it ("Title II: Armed
 * Services"); the CRS's full heading ("Title II: Committee on Armed Services") opens the text inside.
 */
function Disclosure({ section, depth }: { section: SummarySection; depth: 0 | 1 }) {
  const top = depth === 0;
  const open = OPEN[depth];
  const name = shortHeading(section.heading);
  return (
    <details
      id={section.id}
      data-summary-section
      className={cn("scroll-mt-12 border-t border-hairline xl:scroll-mt-0", open.group)}
    >
      <summary
        className={cn(
          "-mx-3 grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-control px-3 hover:bg-accent [&::-webkit-details-marker]:hidden",
          top ? "py-5" : "py-4",
        )}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <Heading
            level={depth + 2}
            className={cn(
              "leading-snug text-ink",
              top ? "text-lg font-bold md:text-xl" : "text-base font-bold",
            )}
          >
            <HeadingText heading={name} />
          </Heading>
          {/* The gist is the first sentence of the text inside, so it steps aside once that is open.
              When it describes one section or subsection rather than the whole title, it says so. */}
          {section.gist && (
            <span
              className={cn("line-clamp-2 text-ink-2", open.gist, top ? "text-base" : "text-sm")}
            >
              {section.gistUnit && (
                <span className="text-ink-2">From its first {section.gistUnit}: </span>
              )}
              {section.gist}
            </span>
          )}
          {(section.contents || section.gistFrom) && (
            <span className="type-meta text-ink-2 tabular-nums">
              {section.contents}
              {section.gistFrom && (
                <span className={open.gist}>
                  {section.contents ? "; from " : "From "}
                  {section.gistFrom}
                </span>
              )}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "mt-1 shrink-0 text-ink-2 transition-transform duration-[200ms] ease-out motion-reduce:transition-none",
            open.chevron,
            top ? "size-5" : "size-4",
          )}
          aria-hidden
        />
      </summary>
      <div className={cn("flex flex-col gap-6", top ? "pb-8" : "pb-6 pl-4 md:pl-6")}>
        {name !== section.heading && (
          <p className="type-meta text-ink-2">
            In the CRS summary: <span className="text-ink-2">{section.heading}</span>
          </p>
        )}
        <Body section={section} depth={depth} />
      </div>
    </details>
  );
}

export function SummarySections({ sections }: { sections: SummarySection[] }) {
  return (
    <ol className="flex flex-col border-b border-hairline">
      {sections.map((section) => (
        <li key={section.id}>
          <Disclosure section={section} depth={0} />
        </li>
      ))}
    </ol>
  );
}
