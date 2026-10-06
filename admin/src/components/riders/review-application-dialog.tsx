"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { RiderApplication } from "@/lib/supabase/queries";
import {
  DOCUMENT_CHECKS,
  composeDecisionNote,
  formatWaiting,
  isWaitingTooLong,
  parseDecisionNote,
  type DocumentCheckKey,
} from "@/lib/rider-applications";
import { ContactShortcuts } from "@/components/rider/rider-row-bits";
import { DocumentLinks } from "./document-links";

/**
 * The application drawer: everything submitted, the document checklist, and the
 * decision.
 *
 * The checklist is the point. `review_rider_application()` will happily approve
 * an applicant whose documents were never looked at, so an admin can tick what
 * they verified, or tick the override box and say in the note why. Approving
 * with nothing ticked is allowed -- an override with a note is a record; a
 * silent approval is not.
 */
export function ReviewApplicationDialog({
  application,
  busy,
  emailTaken,
  onClose,
  onDecide,
}: {
  application: RiderApplication;
  busy: boolean;
  emailTaken: boolean;
  onClose: () => void;
  onDecide: (approve: boolean, note: string | undefined) => Promise<void>;
}) {
  const reviewed = application.status !== "pending";
  const [checks, setChecks] = useState<DocumentCheckKey[]>([]);
  const [overridden, setOverridden] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const prior = parseDecisionNote(application.decisionNote);

  async function decide(approve: boolean) {
    if (approve && emailTaken) {
      setError(
        "That email already belongs to an existing rider. Approving would move their account. Reject this application instead.",
      );
      return;
    }
    if (approve && overridden && !note.trim()) {
      setError("An override needs a note saying why.");
      return;
    }

    const composed = composeDecisionNote({
      checks,
      overridden,
      note: reviewed ? prior.note : note,
    });

    setError(null);
    await onDecide(approve, composed);
  }

  return (
    <Dialog open onClose={busy ? () => {} : onClose} title={application.fullName}>
      <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Detail label="Email">{application.applicantEmail}</Detail>
          <Detail label="Phone">{application.phone}</Detail>
          <Detail label="City">{application.city}</Detail>
          <Detail label="Vehicle">{application.vehicle}</Detail>
          <Detail label="Applied">
            {new Date(application.createdAt).toLocaleString()}
          </Detail>
          <Detail label="Waiting">
            {application.status === "pending" ? (
              <span
                className={
                  isWaitingTooLong(application.waitingDays)
                    ? "text-destructive"
                    : undefined
                }
              >
                {formatWaiting(application.createdAt)}
              </span>
            ) : (
              "—"
            )}
          </Detail>
        </dl>

        <ContactShortcuts
          name={application.fullName}
          phone={application.phone}
          email={application.applicantEmail}
        />

        {emailTaken && !reviewed ? (
          <p
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            An existing rider already uses {application.applicantEmail}. Approval
            would move that rider&apos;s account to this applicant and leave them
            unable to sign in.
          </p>
        ) : null}

        <section aria-label="Documents">
          <h3 className="mb-2 text-sm font-semibold text-card-foreground">
            Documents
          </h3>
          <DocumentLinks
            fields={[
              { label: "Licence", ref: application.licenceRef },
              { label: "ORCR", ref: application.orcrRef },
              { label: "Government ID", ref: application.governmentIdRef },
            ]}
          />
        </section>

        {reviewed ? (
          <section aria-label="Decision">
            <h3 className="mb-1 text-sm font-semibold text-card-foreground">
              Decision — {application.status}
            </h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {prior.note || "No note recorded."}
            </p>
            {prior.checks.length > 0 || prior.overridden ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {prior.checks.length > 0
                  ? `Checked: ${prior.checks
                      .map(
                        (key) =>
                          DOCUMENT_CHECKS.find((c) => c.key === key)?.label ?? key,
                      )
                      .join(", ")}.`
                  : null}
                {prior.overridden ? " Approved with an admin override." : null}
              </p>
            ) : null}
            {application.reviewedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Reviewed {new Date(application.reviewedAt).toLocaleString()}
              </p>
            ) : null}
          </section>
        ) : (
          <>
            <section aria-label="Document checks">
              <h3 className="mb-1 text-sm font-semibold text-card-foreground">
                Document checks
              </h3>
              <ul className="flex flex-col gap-1.5">
                {DOCUMENT_CHECKS.map((check) => (
                  <li key={check.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`check-${check.key}`}
                      checked={checks.includes(check.key)}
                      onChange={(e) =>
                        setChecks((current) =>
                          e.target.checked
                            ? [...current, check.key]
                            : current.filter((k) => k !== check.key),
                        )
                      }
                    />
                    <label
                      htmlFor={`check-${check.key}`}
                      className="text-sm text-card-foreground"
                    >
                      {check.label}
                    </label>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-start gap-2">
                <Checkbox
                  id="override"
                  checked={overridden}
                  onChange={(e) => setOverridden(e.target.checked)}
                />
                <label htmlFor="override" className="text-sm text-card-foreground">
                  Approve anyway (admin override)
                </label>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Recorded in the decision note so it can be found later. Needs a
                reason.
              </p>
            </section>

            <section aria-label="Decision note">
              <label
                htmlFor="decision-note"
                className="mb-1 block text-sm font-semibold text-card-foreground"
              >
                Decision note
              </label>
              <Textarea
                id="decision-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  overridden
                    ? "Required: why are you approving without these checks?"
                    : "Shown to the applicant if you reject."
                }
              />
            </section>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => decide(false)}
                disabled={busy}
              >
                {busy ? "Saving…" : "Reject"}
              </Button>
              <Button onClick={() => decide(true)} disabled={busy}>
                {busy ? "Saving…" : "Approve"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-card-foreground">{children}</dd>
    </div>
  );
}
