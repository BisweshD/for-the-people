import { ViewTransition, type ReactElement } from "react";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

/**
 * Official portrait (self-hosted AVIF/WebP, 4:5) with a blurred tiny placeholder behind it.
 * Without a portrait we show initials, never a stock photo.
 */
export function Portrait({
  portrait,
  name,
  lastName,
  sizes = "160px",
  className,
  priority = false,
  decorative = false,
  morph,
}: {
  portrait: { asset: string; sourceId: string; placeholder: string | null } | null;
  name: string;
  /** The surname as the record gives it, so "Blunt Rochester" gives LB; guessed from the name without it. */
  lastName?: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  /** The name sits right beside the portrait (a list row), so screen readers skip the image. */
  decorative?: boolean;
  /**
   * The person's id, on the list row and on the profile hero only: the same portrait on both pages
   * glides from the row into the profile when the page changes (a shared-element view transition).
   * A name may appear once per page, so other places leave it out.
   */
  morph?: string;
}) {
  const tile = renderTile({ portrait, name, lastName, sizes, className, priority, decorative });
  if (!morph) return tile;
  return (
    <ViewTransition name={`portrait-${morph}`} share="morph" default="none">
      {tile}
    </ViewTransition>
  );
}

function renderTile({
  portrait,
  name,
  lastName,
  sizes,
  className,
  priority,
  decorative,
}: {
  portrait: { asset: string; sourceId: string; placeholder: string | null } | null;
  name: string;
  lastName?: string;
  sizes: string;
  className?: string;
  priority: boolean;
  decorative: boolean;
}): ReactElement {
  const letters = initials(name, lastName);
  if (!portrait) {
    return (
      <div
        className={cn(
          "@container grid aspect-[4/5] place-items-center overflow-hidden rounded-card bg-canvas text-ink-3",
          className,
        )}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : `${name} (no official portrait on file)`}
        aria-hidden={decorative || undefined}
      >
        <span className="text-[30cqw] leading-none font-bold tracking-tight">{letters}</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "@container relative aspect-[4/5] overflow-hidden rounded-card bg-canvas",
        className,
      )}
      style={
        portrait.placeholder
          ? { backgroundImage: `url(${portrait.placeholder})`, backgroundSize: "cover" }
          : undefined
      }
      data-fact="portrait"
      data-receipt-id={portrait.sourceId}
    >
      {/* Lists carry no blurred placeholder, so initials hold the tile until the image arrives. */}
      {!portrait.placeholder && (
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center text-[30cqw] leading-none font-bold tracking-tight text-ink-3"
        >
          {letters}
        </span>
      )}
      <picture>
        <source
          type="image/avif"
          srcSet={`${portrait.asset}-160.avif 160w, ${portrait.asset}-400.avif 400w`}
          sizes={sizes}
        />
        <source
          type="image/webp"
          srcSet={`${portrait.asset}-160.webp 160w, ${portrait.asset}-400.webp 400w`}
          sizes={sizes}
        />
        <img
          src={`${portrait.asset}-400.webp`}
          alt={decorative ? "" : `Official portrait of ${name}`}
          width={400}
          height={500}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
    </div>
  );
}
