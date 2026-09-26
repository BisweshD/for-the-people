"use client";

import { isLocation, type Location, type StateCode } from "@for-the-people/core/client";
import { ChevronDown, LockKeyhole } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { OvalLoader } from "@/components/oval-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { districtLabel, STATE_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";
import { voterActions } from "@/lib/voter-store";

export interface DistrictOption {
  state: StateCode;
  number: number;
}

type Status = { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string };

/** A ZIP code, city, or state that did not settle on one district: the state and the districts to pick from. */
interface Choice {
  state: StateCode;
  districts: number[];
  message: string;
}

type LookupResult =
  | { ok: true; location: Location }
  | { ok: "choose"; choice: Choice }
  | { ok: false; message: string };

const selectClass = cn(
  "h-12 w-full rounded-control border border-input bg-paper px-3 text-base text-ink",
  "focus-visible:outline-2 focus-visible:outline-offset-2",
);

/**
 * While a lookup runs the button keeps its ink fill (never a washed-out disabled grey), shows the oval
 * loader, and ignores further presses; aria-disabled keeps it focusable and announced.
 */
const busyClass = "aria-disabled:cursor-progress aria-disabled:hover:bg-primary";

/** Posts to /api/location and keeps the district ids on this device. The address itself is not kept anywhere. */
async function lookup(body: object): Promise<LookupResult> {
  try {
    const response = await fetch("/api/location", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: unknown = await response.json();
    if (!response.ok) {
      const message =
        json && typeof json === "object" && "error" in json && typeof json.error === "string"
          ? json.error
          : "Something went wrong. Try again.";
      return { ok: false, message };
    }
    if (json && typeof json === "object" && "choose" in json) {
      const choice = json.choose as Partial<Choice> | null;
      if (
        typeof choice?.state === "string" &&
        Array.isArray(choice.districts) &&
        typeof choice.message === "string"
      )
        return { ok: "choose", choice: choice as Choice };
      return { ok: false, message: "Something went wrong. Try again." };
    }
    const reply = json as Partial<Location> | null;
    const location = {
      state: reply?.state,
      districts: reply?.districts,
      ballotDistrictConfirmed: reply?.ballotDistrictConfirmed,
      method: reply?.method,
      setAt: new Date().toISOString(),
    };
    if (!isLocation(location)) return { ok: false, message: "Something went wrong. Try again." };
    voterActions.setLocation(location);
    return { ok: true, location };
  } catch {
    return {
      ok: false,
      message: "You seem to be offline. Connect to the internet and try again.",
    };
  }
}

export function AddressForm({
  districtOptions,
  onLocated,
}: {
  districtOptions: DistrictOption[];
  /** Called after a lookup succeeds and the districts are saved on this device (never with the address). */
  onLocated?: (location: Location) => void;
}) {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [manual, setManual] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const errorId = useId();
  const working = status.kind === "working";

  const inputRef = useRef<HTMLInputElement>(null);
  /** Shows the error and moves focus to the field, where the fix is made. */
  const fail = (message: string) => {
    setStatus({ kind: "error", message });
    inputRef.current?.focus();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (working) return;
    if (address.trim().length < 2) {
      fail("Enter your street address, a ZIP code, or a city and state.");
      return;
    }
    setStatus({ kind: "working" });
    const result = await lookup({ address: address.trim() });
    if (result.ok === "choose") {
      // Not one district: open the picker at the voter’s state, narrowed to the possible districts.
      setStatus({ kind: "idle" });
      setChoice(result.choice);
      setManual(true);
    } else if (result.ok) {
      setAddress("");
      setStatus({ kind: "idle" });
      onLocated?.(result.location);
    } else {
      fail(result.message);
    }
  };

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-paper">
      <div className="mx-5 mt-4 h-0.5 bg-ink md:mx-7" aria-hidden />
      <p className="flex flex-wrap items-center justify-between gap-x-4 border-b border-dashed border-hairline px-5 py-2.5 type-meta text-ink-2 md:px-7">
        <span>Official 2026 general election</span>
        <span className="tabular-nums">Tuesday, November 3</span>
      </p>
      <div className="flex flex-col p-5 md:p-7">
        {/*
        The address never goes into a URL. If someone submits before the page
        has hydrated, the browser falls back to a native submit: method="post" keeps it out of the URL,
        and the input has no name, so the form carries nothing at all. The script reads React state.
      */}
        <form
          method="post"
          onSubmit={submit}
          className="flex flex-col gap-3"
          noValidate
          aria-busy={working || undefined}
        >
          <label htmlFor="ballot-address" className="text-base font-bold text-ink">
            Your home address
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              ref={inputRef}
              id="ballot-address"
              autoComplete="street-address"
              inputMode="text"
              maxLength={200}
              placeholder="Street address, city, state, ZIP"
              value={address}
              readOnly={working}
              onChange={(event) => setAddress(event.target.value)}
              aria-invalid={status.kind === "error" || undefined}
              aria-describedby={status.kind === "error" ? errorId : "address-privacy"}
              className="h-12 rounded-control bg-paper px-3.5 text-base md:text-base"
            />
            <Button
              type="submit"
              size="lg"
              aria-disabled={working || undefined}
              className={cn("h-12 shrink-0 rounded-control px-6 text-base font-bold", busyClass)}
            >
              {working && <OvalLoader size={22} />}
              {working ? "Finding your ballot" : "Find my ballot"}
            </Button>
          </div>
          <p role="status" className="sr-only">
            {working ? "Finding your districts…" : ""}
          </p>
          {status.kind === "error" && (
            <p id={errorId} role="alert" className="text-sm font-bold text-danger">
              {status.message}
            </p>
          )}
          <p id="address-privacy" className="flex items-start gap-2 type-meta text-ink-2">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-ink-3-graphic" aria-hidden />
            <span>
              We send a street address to the U.S. Census Bureau&apos;s address lookup to find your
              congressional districts. A ZIP code or city is matched with Census Bureau files on our
              server instead. We keep only the district numbers, on this device. We do not store
              your address.
            </span>
          </p>
        </form>

        <div className="mt-4 border-t border-hairline pt-2">
          <button
            type="button"
            onClick={() => {
              setManual((open) => !open);
              setChoice(null);
            }}
            aria-expanded={manual}
            aria-controls="manual-district"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-control text-base font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
          >
            {manual ? "Hide the district picker" : "Pick my district instead"}
            <ChevronDown
              className={cn("size-4 transition-transform duration-200", manual && "rotate-180")}
              aria-hidden
            />
          </button>
          {manual && (
            <ManualPicker
              key={choice ? `${choice.state}:${choice.districts.join(",")}` : "open"}
              options={districtOptions}
              choice={choice}
              onLocated={onLocated}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ManualPicker({
  options,
  choice,
  onLocated,
}: {
  options: DistrictOption[];
  /** Set when a ZIP code, city, or state narrowed the choice: the state is chosen, the districts limited. */
  choice: Choice | null;
  onLocated?: (location: Location) => void;
}) {
  const states = useMemo(
    () =>
      [...new Set(options.map((option) => option.state))].toSorted((a, b) =>
        STATE_NAMES[a].localeCompare(STATE_NAMES[b]),
      ),
    [options],
  );
  const allowed = (option: DistrictOption) =>
    !choice || option.state !== choice.state || choice.districts.includes(option.number);
  const [state, setState] = useState<StateCode | "">(choice?.state ?? "");
  const [district, setDistrict] = useState<string>(() => {
    const only = options.filter((option) => option.state === choice?.state && allowed(option));
    return only.length === 1 ? String(only[0]!.number) : "";
  });
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const districts = options.filter((option) => option.state === state && allowed(option));
  const districtRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (choice) districtRef.current?.focus();
  }, [choice]);
  const working = status.kind === "working";
  const ready = state !== "" && district !== "";
  const reasonId = useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!state || district === "" || working) return;
    setStatus({ kind: "working" });
    const result = await lookup({ state, district: Number(district) });
    if (result.ok === true) {
      setStatus({ kind: "idle" });
      onLocated?.(result.location);
    } else {
      setStatus({
        kind: "error",
        message: result.ok === false ? result.message : "Something went wrong. Try again.",
      });
    }
  };

  return (
    <form
      id="manual-district"
      onSubmit={submit}
      className="mt-2 flex flex-col gap-3"
      aria-busy={working || undefined}
    >
      {choice ? (
        <p role="status" className="text-base font-bold text-ink">
          {choice.message}
        </p>
      ) : (
        <p className="type-meta text-ink-2">
          Know your 2026 district? Choose it here and skip the address. Your state&apos;s election
          office can tell you which district you vote in.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="manual-state" className="text-sm font-bold text-ink">
            State
          </label>
          <select
            id="manual-state"
            className={selectClass}
            value={state}
            onChange={(event) => {
              const next = event.target.value as StateCode;
              setState(next);
              const only = options.filter((option) => option.state === next && allowed(option));
              setDistrict(only.length === 1 ? String(only[0]!.number) : "");
            }}
          >
            <option value="">Choose a state</option>
            {states.map((code) => (
              <option key={code} value={code}>
                {STATE_NAMES[code]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="manual-district-number" className="text-sm font-bold text-ink">
            District on your 2026 ballot
          </label>
          <select
            ref={districtRef}
            id="manual-district-number"
            className={selectClass}
            value={district}
            disabled={!state}
            onChange={(event) => setDistrict(event.target.value)}
          >
            <option value="">{state ? "Choose a district" : "Choose a state first"}</option>
            {districts.map((option) => (
              <option key={option.number} value={option.number}>
                {districtLabel(option.state, option.number)}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={!ready}
          aria-disabled={working || undefined}
          aria-describedby={ready ? undefined : reasonId}
          className={cn(
            "h-12 rounded-control px-5 text-base font-bold disabled:border-hairline disabled:bg-paper disabled:text-ink-3 disabled:opacity-100",
            busyClass,
          )}
        >
          {working && <OvalLoader size={22} />}
          Use this district
        </Button>
      </div>
      {!ready && (
        <p id={reasonId} className="type-meta text-ink-2">
          {state ? "Choose your district to continue." : "Choose your state, then your district."}
        </p>
      )}
      {status.kind === "error" && (
        <p role="alert" className="text-sm font-bold text-danger">
          {status.message}
        </p>
      )}
    </form>
  );
}
