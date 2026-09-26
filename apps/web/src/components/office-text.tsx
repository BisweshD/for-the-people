import { officeLine, officeShort } from "@/lib/format";

type OfficeMember = Parameters<typeof officeLine>[0];

/** Keeps each district code ("TX-34") on one line, so a narrow column never breaks it at the hyphen. */
function Unbroken({ text }: { text: string }) {
  const parts = text.split(/([A-Z]{2}-(?:\d{1,2}|AL))/);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * A member's office line. "full" is "U.S. Representative, TX-34"; "short" is "Rep., TX-34";
 * "responsive" shows the short form below 640px and the full one above.
 */
export function OfficeText({
  member,
  form = "full",
}: {
  member: OfficeMember;
  form?: "full" | "short" | "responsive";
}) {
  if (form === "full") return <Unbroken text={officeLine(member)} />;
  if (form === "short") return <Unbroken text={officeShort(member)} />;
  return (
    <>
      <span className="sm:hidden">
        <Unbroken text={officeShort(member)} />
      </span>
      <span className="hidden sm:inline">
        <Unbroken text={officeLine(member)} />
      </span>
    </>
  );
}
