import { cn } from "@/lib/utils";

/**
 * The one layout of the trust pages (Methodology, Sources, Status, Changelog, Election). From 1280 px:
 * a reading column and a 15rem right rail that starts level with the title under an ink rule and stays
 * in view while the page scrolls, holding the page's contents or its controls. Below 1280 px the rail
 * sits between the header and the body, or is left out where the page is short enough not to need it
 * (`railClassName="max-xl:hidden"`). With `stickyRail`, the rail also stays in view below 1280 px,
 * just under the site header, for a compact section menu on long pages.
 */
export function TrustLayout({
  header,
  rail,
  railClassName,
  stickyRail = false,
  children,
}: {
  header: React.ReactNode;
  rail: React.ReactNode;
  railClassName?: string;
  stickyRail?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12 xl:grid-cols-[minmax(0,1fr)_15rem] xl:gap-x-16">
      <div className="xl:col-start-1 xl:row-start-1">{header}</div>
      <div
        className={cn(
          "xl:sticky xl:top-24 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:self-start xl:border-t-2 xl:border-ink xl:pt-4",
          // Under the 57 px (65 px from 768) site header, on a band of the page's own canvas.
          stickyRail &&
            "max-xl:sticky max-xl:top-[57px] max-xl:z-30 max-xl:-mx-4 max-xl:bg-canvas max-xl:px-4 max-xl:py-2 md:max-xl:top-[65px] md:max-xl:-mx-6 md:max-xl:px-6",
          railClassName,
        )}
      >
        {rail}
      </div>
      <div className="min-w-0 xl:col-start-1 xl:row-start-2">{children}</div>
    </div>
  );
}
