"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeReference } from "@/lib/track-reference";

/**
 * The order-reference box, shared by the hero and the /track page so a customer
 * gets the same input wherever they land.
 *
 * It does not query anything itself: it normalises what was typed and hands off
 * to /track/[reference], which already knows how to render every state. That
 * keeps the lookup in one place and means a bad reference gets a real page
 * instead of a dead end.
 */
export function TrackReferenceForm({
  variant = "inline",
}: {
  variant?: "inline" | "page";
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reference = normalizeReference(value);
    if (!reference) {
      setError("That does not look like a KFD reference. It looks like #KFD-XXXXXXXXXXXX.");
      return;
    }
    setError("");
    router.push(`/track/${encodeURIComponent(reference)}`);
  }

  const id = variant === "page" ? "track-reference-page" : "track-reference";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={id} className="sr-only">
          Order reference
        </label>
        <input
          id={id}
          name="reference"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError("");
          }}
          className="pixel-input flex-1"
          placeholder="#KFD-XXXXXXXXXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button type="submit" className="pixel-btn pixel-btn-primary pixel-focus">
          Track order
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive" data-track-form-error>
          {error}
        </p>
      ) : null}
    </form>
  );
}
