"use client";

import { useState } from "react";
import { submitLead, type LeadKind } from "@/lib/leads";

/**
 * The one form behind the waitlist and both partner applications.
 *
 * It posts through public.submit_lead(), which validates again server-side --
 * the checks here are for a fast, friendly reply, not for security. Three
 * deliberate choices:
 *
 *   * The consent box is never pre-ticked. A pre-ticked box is not consent.
 *   * A honeypot field ("company") is hidden off-screen. A bot that fills it
 *     gets a success response and no row; a human never sees it.
 *   * The note field is optional and only shown where it makes sense.
 */
export function LeadForm({
  kind,
  submitLabel,
  withNote = false,
  notePlaceholder = "Anything we should know? (optional)",
  compact = false,
}: {
  kind: LeadKind;
  submitLabel: string;
  withNote?: boolean;
  notePlaceholder?: string;
  compact?: boolean;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Bot trap: answer as if saved, write nothing.
    if (honeypot.trim()) {
      setState("done");
      setMessage("Salamat! We'll be in touch.");
      return;
    }

    if (!name.trim() || !contact.trim()) {
      setState("error");
      setMessage("Please add your name and a phone number or email.");
      return;
    }
    if (!consent) {
      setState("error");
      setMessage("Please tick the consent box so we can contact you.");
      return;
    }

    setState("sending");
    setMessage("");
    try {
      await submitLead({
        kind,
        name: name.trim(),
        contact: contact.trim(),
        note,
        consent,
      });
      setState("done");
      setMessage("Salamat! We'll be in touch.");
      setName("");
      setContact("");
      setNote("");
      setConsent(false);
    } catch {
      setState("error");
      setMessage("We could not save that just now. Please try again in a moment.");
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="pixel-card pixel-body p-5 text-sm" data-lead-state="done">
        {message}
      </p>
    );
  }

  const id = `lead-${kind}`;

  return (
    <form
      onSubmit={onSubmit}
      className={compact ? "flex flex-col gap-4" : "pixel-card flex flex-col gap-4 p-6"}
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-bold">
          Name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="pixel-input"
          placeholder="Juan Dela Cruz"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-contact`} className="text-sm font-bold">
          Phone or email
        </label>
        <input
          id={`${id}-contact`}
          name="contact"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          autoComplete="tel"
          inputMode="text"
          className="pixel-input"
          placeholder="0917 000 0000"
          required
        />
      </div>

      {withNote ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-note`} className="text-sm font-bold">
            Note (optional)
          </label>
          <textarea
            id={`${id}-note`}
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            className="pixel-input"
            placeholder={notePlaceholder}
          />
        </div>
      ) : null}

      {/* Honeypot. Hidden from sight and from assistive tech, never tabbable. */}
      <div aria-hidden="true" className="pixel-honeypot">
        <label htmlFor={`${id}-company`}>Company</label>
        <input
          id={`${id}-company`}
          name="company"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
          required
        />
        <span className="pixel-body text-xs">
          I agree to be contacted about KFD. We will only use this to reach you
          about your signup.
        </span>
      </label>

      <button
        type="submit"
        disabled={state === "sending"}
        className="pixel-btn pixel-btn-primary pixel-focus disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : submitLabel}
      </button>

      {state === "error" ? (
        <p role="alert" className="text-sm text-destructive" data-lead-state="error">
          {message}
        </p>
      ) : null}
    </form>
  );
}
