import Link from "next/link";
import { Suspense } from "react";
import { ReportMistakeLink } from "@/components/shell/report-mistake-link";

const LINKS = [
  { href: "/methodology", label: "Methodology" },
  { href: "/sources", label: "Sources" },
  { href: "/corrections", label: "Report a mistake" },
  { href: "/changelog", label: "Changelog" },
  { href: "/status", label: "Status" },
  { href: "/election", label: "Election" },
] as const;

const linkClass =
  "inline-flex min-h-11 items-center rounded-control px-2 text-sm font-bold text-ink-2 transition-colors duration-(--dur-fast) can-hover:bg-badge can-hover:text-ink";

/** The small site footer: the trust pages and the election hub. Bottom padding clears the mobile tab bar. */
export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-6 pb-28 md:flex-row md:items-center md:justify-between md:px-6 md:pb-8">
        <nav aria-label="About For The People">
          <ul className="flex flex-wrap gap-x-1 gap-y-0">
            {LINKS.map((link) => (
              <li key={link.href}>
                {link.href === "/corrections" ? (
                  // Reads the pathname, so it renders inside <Suspense> with the plain link as fallback.
                  <Suspense
                    fallback={
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    }
                  >
                    <ReportMistakeLink className={linkClass} />
                  </Suspense>
                ) : (
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <p className="px-2 text-sm text-ink-2">
          Free and nonpartisan. Every fact links to the official record.
        </p>
      </div>
    </footer>
  );
}
