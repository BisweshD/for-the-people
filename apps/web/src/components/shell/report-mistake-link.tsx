"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { reportHref } from "@/lib/report-link";

/** "Report a mistake", carrying the page it was opened from so the form can name the record. */
export function ReportMistakeLink({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <Link href={reportHref(pathname)} className={className}>
      Report a mistake
    </Link>
  );
}
