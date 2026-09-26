"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PartyTag } from "@/components/party-tag";
import { RollCallReceiptButton } from "@/components/bills/receipt-button";
import { PositionGlyph } from "@/components/rollcall/position-cell";
import { honorific, isVotersMember, type BoardView, type SeatView } from "@/lib/bill-views";
import { chamberName, districtLabel, formatDate } from "@/lib/format";
import { useVoter } from "@/lib/voter-store";

/**
 * How the voter's own members voted on the key roll call in each chamber. The voter's location stays on
 * the device: the page ships every member's vote and picks theirs here, the way Matches does.
 */
export function YourMembers({ boards }: { boards: BoardView[] }) {
  const { location } = useVoter();

  const rows = useMemo(
    () =>
      boards.flatMap((board) =>
        board.seats
          .filter((seat) => isVotersMember(board.rollCall.chamber, seat, location))
          .map((seat) => ({ board, seat })),
      ),
    [boards, location],
  );

  if (!location) {
    return (
      <p className="text-base text-ink-2">
        <Link
          href="/ballot"
          className="-my-2 inline-block py-2 font-bold text-ink underline underline-offset-4"
        >
          Add your address
        </Link>{" "}
        to see how your representative and senators voted. It stays on this device.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-base text-ink-2">No record yet of your members voting on this bill.</p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-hairline rounded-card border border-hairline bg-paper">
      {rows.map(({ board, seat }) => (
        <MemberRow key={`${board.rollCall.id}-${seat.slug}`} board={board} seat={seat} />
      ))}
    </ul>
  );
}

const VOTED: Record<SeatView["position"], string> = {
  Yea: "Voted Yea",
  Nay: "Voted Nay",
  Present: "Voted Present",
  NotVoting: "Did not vote",
};

function MemberRow({ board, seat }: { board: BoardView; seat: SeatView }) {
  const { rollCall } = board;
  const where =
    rollCall.chamber === "senate" ? seat.state : districtLabel(seat.state, seat.district);
  return (
    <li
      className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-6"
      data-fact="vote-position"
      data-receipt-id={rollCall.receipt.sourceId}
    >
      <div className="flex min-w-0 items-center gap-3">
        <PositionGlyph position={seat.position} className="size-7 text-sm" />
        <div className="min-w-0">
          <p className="font-bold text-ink">
            <Link
              href={`/people/${seat.slug}`}
              className="underline decoration-hairline underline-offset-4 hover:decoration-ink"
            >
              {honorific(rollCall.chamber, seat.state)} {seat.name}
            </Link>{" "}
            <PartyTag party={seat.party} className="ml-1 align-middle" />
          </p>
          <p className="type-meta text-ink-2">
            {where}: {VOTED[seat.position]}
          </p>
        </div>
      </div>
      <RollCallReceiptButton
        rollCall={rollCall}
        subject={`${seat.name}'s vote`}
        label={`${chamberName(rollCall.chamber)} roll call ${rollCall.number}, ${formatDate(rollCall.date)}`}
        className="shrink-0 font-normal text-ink-2"
      />
    </li>
  );
}
