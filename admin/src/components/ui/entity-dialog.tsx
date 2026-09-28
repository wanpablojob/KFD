"use client";

import { useState } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { Select } from "./select";
import { Label } from "./field";

/**
 * A select option. A plain string still works and is used as both value and
 * label; the object form exists for the cases where the two differ, which is
 * every id-to-name case -- a restaurant picker has to submit `rst_05` while
 * showing "D & D Food Hub".
 */
export type DialogOption = string | { value: string; label: string };

export type DialogField = {
  key: string;
  label: string;
  type?: "text" | "number";
  options?: readonly DialogOption[];
  required?: boolean;
  placeholder?: string;
};

/**
 * Generic create/edit form. Mount it with a `key` derived from the edited row
 * so switching rows resets the values.
 */
export function EntityDialog({
  open,
  title,
  fields,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  fields: DialogField[];
  initial?: Record<string, string>;
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    initial ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function submit() {
    const missing = fields.find(
      (f) => f.required && !values[f.key]?.trim(),
    );
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        {fields.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
            {f.options ? (
              <Select
                id={`f-${f.key}`}
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key)(e.target.value)}
                disabled={saving}
              >
                {f.options.map((o) =>
                  typeof o === "string" ? (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ) : (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ),
                )}
              </Select>
            ) : (
              <Input
                id={`f-${f.key}`}
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key)(e.target.value)}
                disabled={saving}
                required={f.required}
              />
            )}
          </div>
        ))}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
