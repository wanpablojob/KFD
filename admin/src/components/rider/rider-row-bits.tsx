"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { FLAG_META, type RiderFlag } from "@/lib/rider-flags";

/**
 * Warning badges with the reason attached.
 *
 * Each badge wraps itself in the flag's own Tooltip, because a bare "High
 * failures" badge is a label an admin has to interpret, and the threshold it
 * refers to is a policy that only exists in lib/rider-flags.ts. The tooltip
 * opens on focus as well as hover so it is reachable by keyboard.
 */
export function RiderFlagBadges({
  flags,
  riderName,
}: {
  flags: RiderFlag[];
  riderName: string;
}) {
  if (flags.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {flags.map((flag) => (
        <Tooltip key={flag} label={FLAG_META[flag].help}>
          <Badge variant="destructive" size="sm">
            {FLAG_META[flag].label}
            <span className="sr-only"> for {riderName}</span>
          </Badge>
        </Tooltip>
      ))}
    </span>
  );
}

/**
 * Suspended is a state rather than a flag -- it has its own columns, its own
 * filter card and its own RPC -- so it is rendered separately from the warnings
 * above. The reason is behind the badge because it is free text typed by
 * whoever suspended the rider and can be a paragraph.
 */
export function SuspendedBadge({
  reason,
  suspendedAt,
}: {
  reason: string | null;
  suspendedAt: string | null;
}) {
  if (!suspendedAt) return null;
  return (
    <Tooltip
      label={
        reason
          ? `Suspended: ${reason}`
          : "Suspended. No reason was recorded."
      }
    >
      <Badge variant="destructive" size="sm">
        Suspended
      </Badge>
    </Tooltip>
  );
}

/** tel: / mailto: links plus copy-to-clipboard for the two values. */
export function ContactShortcuts({
  name,
  phone,
  email,
}: {
  name: string;
  phone: string;
  email: string;
}) {
  const [copied, setCopied] = useState<"phone" | "email" | null>(null);

  async function copy(field: "phone" | "email", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
    } catch {
      // Clipboard access is denied in some embedded browsers and over plain
      // http. The value is on screen and selectable, so there is nothing useful
      // to say here -- a failure toast for a copy the admin can do by hand is
      // noise.
      setCopied(null);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {phone ? (
        <a
          href={`tel:${phone}`}
          aria-label={`Call ${name} on ${phone}`}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Call
        </a>
      ) : null}

      <a
        href={`mailto:${email}`}
        aria-label={`Email ${name} at ${email}`}
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Email
      </a>

      {phone ? (
        <button
          type="button"
          onClick={() => void copy("phone", phone)}
          aria-label={`Copy ${name}'s phone number`}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied === "phone" ? "Copied" : "Copy phone"}
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => void copy("email", email)}
        aria-label={`Copy ${name}'s email address`}
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied === "email" ? "Copied" : "Copy email"}
      </button>
    </span>
  );
}