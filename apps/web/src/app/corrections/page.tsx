import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import Link from "next/link";
import { Suspense } from "react";
import { CorrectionForm } from "@/components/trust/correction-form";
import { PageHeader } from "@/components/trust/page-header";
import { RecordChip } from "@/components/trust/record-chip";
import { recordFromQuery } from "@/lib/report-link";
import { recordChip } from "@/server/record-chip";

export const metadata: Metadata = {
  title: "Report a mistake",
  description:
    "Found something on For The People that does not match the official record? Tell us and we will check it.",
};

const STEPS = [
  "We check your report against the official record: the House Clerk, the Senate, GovInfo, or the FEC.",
  "If we got it wrong, we fix the data or the wording and note the fix on the changelog.",
  "If the official record says what we show, we leave it and note why.",
];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The form, with the record a "Report a mistake" link named shown as a chip. The path is checked by
 * recordFromQuery before anything is read, and the chip is built from our own data on the server.
 */
async function FormWithRecord({
  searchParams,
}: {
  searchParams: PageProps<"/corrections">["searchParams"];
}) {
  const params = await searchParams;
  const record = first(params.id) ? null : recordFromQuery(first(params.record));
  const named = record ? await recordChip(record) : null;
  return (
    <NuqsAdapter>
      <CorrectionForm
        named={
          named ? { path: named.path, name: named.name, chip: <RecordChip record={named} /> } : null
        }
      />
    </NuqsAdapter>
  );
}

export default function CorrectionsPage({ searchParams }: PageProps<"/corrections">) {
  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)] md:gap-12">
      <div className="flex min-w-0 flex-col gap-8">
        <PageHeader
          title="Report a mistake"
          lede="If a vote, a name, a number, or a key vote's wording does not match the official record, tell us. Every report is read."
        />
        <Suspense fallback={<div className="min-h-[640px] rounded-card bg-paper" />}>
          <FormWithRecord searchParams={searchParams} />
        </Suspense>
      </div>
      <aside aria-labelledby="what-happens" className="flex flex-col gap-4 md:pt-2">
        <h2 id="what-happens" className="text-xl font-bold text-ink">
          What happens next
        </h2>
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-3 text-base text-ink-2">
              <span
                className="text-lg leading-6 font-extrabold text-ink-3 tabular-nums"
                aria-hidden
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-base text-ink-2">
          See the rules we follow on the{" "}
          <Link href="/methodology" className="font-semibold text-ink underline underline-offset-4">
            methodology page
          </Link>
          .
        </p>
      </aside>
    </div>
  );
}
