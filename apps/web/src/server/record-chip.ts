import { MeasureId, personIdFromSlug, RollCallId, type Party } from "@for-the-people/core";
import { chamberName, formatDate, measureLabel, officeLine } from "@/lib/format";
import { reportablePageName } from "@/lib/report-link";
import { getMeasureDetail, getMemberIndex, getRollCallDetail } from "@/server/data";

/**
 * The record a "Report a mistake" link names, as the corrections form shows it: a member with their
 * portrait, a bill or roll call with its number, or one of the fixed pages by its own title. Read from
 * our own data only, from a path that already passed recordFromQuery (lib/report-link.ts). A record
 * that does not resolve names nothing, so the form shows no chip and an empty field.
 */
export type RecordChipView =
  | {
      kind: "person";
      path: string;
      name: string;
      detail: string;
      party: Party;
      portrait: { asset: string; sourceId: string; placeholder: string | null } | null;
    }
  | {
      kind: "measure" | "rollCall";
      path: string;
      badge: string;
      name: string;
      detail: string;
      receiptId: string;
    }
  | { kind: "page"; path: string; name: string; detail: string };

export async function recordChip(path: string): Promise<RecordChipView | null> {
  const name = reportablePageName(path);
  if (name) return { kind: "page", path, name, detail: "A page on For The People" };
  const [, section, slug, ...rest] = path.split("/");
  if (!slug || rest.length > 0) return null;

  if (section === "people") {
    const id = personIdFromSlug(slug);
    const member = id ? (await getMemberIndex()).find((entry) => entry.id === id) : undefined;
    if (!member) return null;
    return {
      kind: "person",
      path,
      name: member.name,
      detail: member.serving ? officeLine(member) : `Former ${officeLine(member)}`,
      party: member.party,
      portrait: member.portrait,
    };
  }

  if (section === "bills" && MeasureId.safeParse(slug).success) {
    const detail = await getMeasureDetail(slug);
    if (!detail) return null;
    return {
      kind: "measure",
      path,
      badge: measureLabel(detail.measure.id),
      name: detail.measure.titles.display,
      detail: "Bill",
      receiptId: detail.measure.sourceIds[0]!,
    };
  }

  if (section === "votes" && RollCallId.safeParse(slug).success) {
    const detail = await getRollCallDetail(slug);
    if (!detail) return null;
    const { rollCall } = detail;
    return {
      kind: "rollCall",
      path,
      badge: `No. ${rollCall.number}`,
      name: rollCall.question,
      detail: `${chamberName(rollCall.chamber)} roll call, ${formatDate(rollCall.date)}`,
      receiptId: rollCall.sourceId,
    };
  }

  return null;
}
