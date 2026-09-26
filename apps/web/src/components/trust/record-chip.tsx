import { FileText } from "lucide-react";
import { PartyTag } from "@/components/party-tag";
import { Portrait } from "@/components/portrait";
import type { RecordChipView } from "@/server/record-chip";

/**
 * The named record's face in the corrections form: a portrait for a member, the number for a bill or
 * roll call, a page mark for anything else, then the name or title. Rendered on the server and handed to
 * the form, so the portrait costs the form no JavaScript. The form adds the remove button.
 */
export function RecordChip({ record }: { record: RecordChipView }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {record.kind === "person" ? (
        <span className="w-10 shrink-0">
          <Portrait
            portrait={record.portrait}
            name={record.name}
            sizes="40px"
            decorative
            className="w-full rounded-control"
          />
        </span>
      ) : (
        <span className="grid h-12 min-w-12 shrink-0 place-items-center rounded-control bg-paper px-2 text-sm font-bold whitespace-nowrap text-ink tabular-nums ring-1 ring-hairline">
          {record.kind === "page" ? (
            <FileText className="size-5 text-ink-2" aria-hidden />
          ) : (
            record.badge
          )}
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="line-clamp-2 text-base leading-snug font-semibold break-words text-ink"
            {...(record.kind === "measure" || record.kind === "rollCall"
              ? { "data-fact": "record-title", "data-receipt-id": record.receiptId }
              : {})}
          >
            {record.name}
          </span>
          {record.kind === "person" && <PartyTag party={record.party} className="shrink-0" />}
        </span>
        <span className="truncate text-sm text-ink-2">{record.detail}</span>
      </span>
    </span>
  );
}
