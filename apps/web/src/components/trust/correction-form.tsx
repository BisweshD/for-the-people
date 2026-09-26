"use client";

import type { CorrectionTargetKind } from "@for-the-people/core";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { X } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { OvalLoader } from "@/components/oval-loader";
import { SelectField } from "@/components/ui/select-field";
import { kindForRecord } from "@/lib/report-link";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** The public corrections form. It asks only about the mistake: no name, email, or phone. */

type TargetKind = (typeof CorrectionTargetKind.options)[number];

const KIND_LABELS: Record<TargetKind, string> = {
  person: "A member of Congress or a candidate",
  rollCall: "A roll call vote",
  measure: "A bill",
  keyVote: "A key vote",
  financeSummary: "Campaign money",
  candidacy: "A race or a candidate on the ballot",
  other: "Something else",
};

/** Every kind the API accepts: KIND_LABELS is typed on the schema, so a new kind fails the build here. */
const KINDS = Object.keys(KIND_LABELS) as TargetKind[];
const KIND_OPTIONS = KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }));

/**
 * The form validates against the same schema the API uses. It loads (with Zod) the first time someone
 * focuses the form, not with the page, so the page stays inside the first-load budget (BRIEF 10.7).
 */
const loadSchema = () => import("@for-the-people/core").then((core) => core.SubmitCorrectionInput);
const REPORT_MIN = 10;
const REPORT_MAX = 2000;
const REPORT_NEAR = 1800;

type Field = "kind" | "id" | "field" | "report";
type Errors = Partial<Record<Field, string>>;

const fieldClass =
  "w-full rounded-input border border-input bg-paper px-3 text-base text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] focus-visible:border-ink-2 focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-danger aria-invalid:ring-danger/20";

/** Maps Zod issue paths from SubmitCorrectionInput onto the form's fields, in plain words. */
function errorsFromIssues(issues: Array<{ path: PropertyKey[]; code: string }>): Errors {
  const errors: Errors = {};
  for (const issue of issues) {
    const [head, sub] = issue.path.map(String);
    if (head === "report") {
      errors.report =
        issue.code === "too_small"
          ? `Write at least ${REPORT_MIN} characters so we know what to check.`
          : `Keep it under ${REPORT_MAX.toLocaleString("en-US")} characters.`;
    } else if (head === "target" && sub === "kind")
      errors.kind = "Choose what the mistake is about.";
    else if (head === "target" && sub === "id")
      errors.id = "Use 120 characters or fewer. The page address after the domain is enough.";
    else if (head === "target" && sub === "field") errors.field = "Use 80 characters or fewer.";
  }
  return errors;
}

/** The record a "Report a mistake" link named, already checked and described on the server. */
export interface NamedRecord {
  path: string;
  name: string;
  chip: ReactNode;
}

export function CorrectionForm({ named = null }: { named?: NamedRecord | null }) {
  const [query] = useQueryStates({
    kind: parseAsStringLiteral(KINDS),
    id: parseAsString,
    field: parseAsString,
  });
  // The page a "Report a mistake" link came from, only when the server found it (a real record or
  // page). Any other ?record= value prefills nothing.
  const record = query.id ? null : (named?.path ?? null);
  const [kind, setKind] = useState<TargetKind | "">(
    query.kind ?? (record ? (kindForRecord(record) ?? "") : ""),
  );
  const [target, setTarget] = useState(query.id ?? record ?? "");
  // A named record shows as a chip until it is removed; then the plain field takes its place, empty.
  const [chip, setChip] = useState(record !== null);
  const prefilled = !query.id && record !== null && target === record;
  const targetRef = useRef<HTMLInputElement>(null);
  const [field, setField] = useState(query.field ?? "");
  const [report, setReport] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const ids = useId();

  const sending = status === "sending";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setServerError(null);
    const input = {
      target: { kind: kind || undefined, id: target.trim(), field: field.trim() || null },
      report: report.trim(),
    };
    const parsed = (await loadSchema()).safeParse(input);
    const localErrors: Errors = parsed.success ? {} : errorsFromIssues(parsed.error.issues);
    if (!input.target.id) localErrors.id = "Paste the page address, or name the member or bill.";
    setErrors(localErrors);
    if (!parsed.success || Object.keys(localErrors).length > 0) {
      const first = (["kind", "id", "field", "report"] as const).find((key) => localErrors[key]);
      if (first) document.getElementById(`${ids}-${first}`)?.focus();
      return;
    }
    setStatus("sending");
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setServerError(body?.error ?? "The report did not go through. Try again in a moment.");
        setStatus("idle");
        return;
      }
      setStatus("sent");
      setReport("");
      setField("");
      toast.success("Report sent");
    } catch {
      setServerError("The report did not go through. Check your connection and try again.");
      setStatus("idle");
    }
  }

  const describedBy = (key: Field, hint?: boolean) =>
    [hint && `${ids}-${key}-hint`, errors[key] && `${ids}-${key}-error`]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form
      onSubmit={submit}
      onFocusCapture={() => void loadSchema()}
      noValidate
      className="overflow-hidden rounded-card border border-hairline bg-paper"
      aria-describedby={`${ids}-privacy`}
    >
      {/* The ballot sheet's header: an ink rule and a dashed line of plain facts about the form. */}
      <div className="h-0.5 bg-ink" aria-hidden />
      <p className="flex flex-wrap items-center justify-between gap-x-4 border-b border-dashed border-hairline px-5 py-2.5 type-meta text-ink-2 md:px-7">
        <span>Report to For The People</span>
        <span>No name or email needed</span>
      </p>
      <div className="flex flex-col gap-6 p-5 md:p-7">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${ids}-kind`} className="text-base font-semibold text-ink">
            What is the mistake about? <Required />
          </label>
          <SelectField
            id={`${ids}-kind`}
            value={kind}
            onValueChange={(value) => setKind(value as TargetKind)}
            placeholder="Choose one"
            options={KIND_OPTIONS}
            aria-required="true"
            aria-invalid={Boolean(errors.kind)}
            aria-describedby={describedBy("kind")}
          />
          <FieldError id={`${ids}-kind-error`} message={errors.kind} />
        </div>

        <div className="flex flex-col gap-2">
          <label
            id={`${ids}-id-label`}
            htmlFor={chip ? undefined : `${ids}-id`}
            className="text-base font-semibold text-ink"
          >
            Which page or record? <Required />
          </label>
          <p id={`${ids}-id-hint`} className="text-sm text-ink-2">
            {chip
              ? "Filled in from the page you came from. Remove it if the mistake is somewhere else."
              : prefilled
                ? "Filled in from the page you came from. Change it if the mistake is somewhere else."
                : "Paste a page link, or name a member or a bill like H.R. 1."}
          </p>
          {chip && named ? (
            <div
              role="group"
              aria-labelledby={`${ids}-id-label`}
              aria-describedby={`${ids}-id-hint`}
              className="flex items-center gap-2 rounded-control bg-canvas py-2 pr-1 pl-2 ring-1 ring-hairline"
            >
              <span className="min-w-0 flex-1">{named.chip}</span>
              <button
                type="button"
                onClick={() => {
                  flushSync(() => {
                    setChip(false);
                    setTarget("");
                  });
                  targetRef.current?.focus();
                }}
                className="grid size-11 shrink-0 place-items-center rounded-control text-ink-2 transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <X className="size-5" aria-hidden />
                <span className="sr-only">Remove {named.name}</span>
              </button>
            </div>
          ) : (
            <input
              ref={targetRef}
              id={`${ids}-id`}
              aria-required="true"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              maxLength={200}
              autoComplete="off"
              aria-invalid={Boolean(errors.id)}
              aria-describedby={describedBy("id", true)}
              className={cn(fieldClass, "min-h-11")}
            />
          )}
          <FieldError id={`${ids}-id-error`} message={errors.id} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={`${ids}-field`} className="text-base font-semibold text-ink">
            Which detail is wrong? <span className="font-normal text-ink-2">(optional)</span>
          </label>
          <p id={`${ids}-field-hint`} className="text-sm text-ink-2">
            For example: party, vote on H.R. 1, missed votes, or portrait.
          </p>
          <input
            id={`${ids}-field`}
            value={field}
            onChange={(event) => setField(event.target.value)}
            maxLength={120}
            autoComplete="off"
            aria-invalid={Boolean(errors.field)}
            aria-describedby={describedBy("field", true)}
            className={cn(fieldClass, "min-h-11")}
          />
          <FieldError id={`${ids}-field-error`} message={errors.field} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={`${ids}-report`} className="text-base font-semibold text-ink">
            What should it say? <Required />
          </label>
          <p id={`${ids}-report-hint`} className="text-sm text-ink-2">
            Write the correct fact and, if you can, link the official record that shows it.
          </p>
          <textarea
            id={`${ids}-report`}
            aria-required="true"
            value={report}
            onChange={(event) => setReport(event.target.value)}
            rows={6}
            maxLength={REPORT_MAX + 200}
            aria-invalid={Boolean(errors.report)}
            aria-describedby={describedBy("report", true)}
            className={cn(fieldClass, "min-h-36 py-2.5 leading-relaxed")}
          />
          <div className="flex items-start justify-between gap-4">
            <FieldError id={`${ids}-report-error`} message={errors.report} />
            <span
              className={cn(
                "ml-auto shrink-0 text-sm tabular-nums",
                report.trim().length > REPORT_MAX ? "text-danger" : "text-ink-2",
              )}
              // Quiet while typing; spoken only once the report nears the limit.
              aria-live={report.trim().length >= REPORT_NEAR ? "polite" : "off"}
            >
              {report.trim().length.toLocaleString("en-US")} of {REPORT_MAX.toLocaleString("en-US")}
            </span>
          </div>
        </div>

        <p id={`${ids}-privacy`} className="text-sm text-ink-2">
          Please leave out your name, email, and phone number. We do not store who sent a report or
          your IP address, so we cannot reply; fixes appear on the changelog.
        </p>

        {serverError && (
          <p role="alert" className="text-base font-semibold text-danger">
            {serverError}
          </p>
        )}
        {status === "sent" && (
          <p role="status" className="text-base font-semibold text-agree">
            Report sent. Thank you for checking our work.
          </p>
        )}

        {/* Stays full ink while sending (a faded button drops below 4.5:1) and ignores repeat presses. */}
        <button
          type="submit"
          aria-disabled={sending || undefined}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-control bg-primary px-6 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98] aria-disabled:cursor-progress aria-disabled:hover:opacity-100 sm:w-fit"
        >
          {sending && <OvalLoader size={20} />}
          {sending ? "Sending your report" : "Send report"}
        </button>
      </div>
    </form>
  );
}

/** Marks a field as required in words, matching the "(optional)" on the one field that is not. */
function Required() {
  return <span className="font-normal text-ink-2">(required)</span>;
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-semibold text-danger">
      {message}
    </p>
  );
}
