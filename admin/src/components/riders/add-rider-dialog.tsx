"use client";

import { EntityDialog, type DialogField } from "@/components/ui/entity-dialog";
import {
  validateRiderFields,
  type RiderFieldError,
} from "@/lib/rider-validation";

export const RIDER_FIELDS: DialogField[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  {
    key: "vehicle",
    label: "Vehicle",
    options: ["bicycle", "scooter", "motorcycle", "car"],
  },
  { key: "status", label: "Status", options: ["online", "busy", "offline"] },
];

export function fieldLabel(error: RiderFieldError): string {
  return (
    RIDER_FIELDS.find((field) => field.key === error.field)?.label ??
    error.field
  );
}

export function RiderFormDialog({
  existingEmails,
  onClose,
  onSave,
}: {
  existingEmails: readonly string[];
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  return (
    <EntityDialog
      open
      title="Add Rider"
      description="Email and phone are how dispatch reaches this rider. Both are required."
      fields={RIDER_FIELDS}
      initial={{ city: "", vehicle: "scooter", status: "offline" }}
      onClose={onClose}
      onSave={async (values) => {
        // EntityDialog catches and displays a thrown message, so every rule is
        // reported at once rather than one round-trip per field.
        const found = validateRiderFields(
          {
            name: values.name ?? "",
            email: values.email ?? "",
            phone: values.phone ?? "",
            city: values.city ?? "",
          },
          existingEmails,
        );
        if (found.length > 0) {
          throw new Error(
            found
              .map((error) => `${fieldLabel(error)}: ${error.message}`)
              .join(" "),
          );
        }
        await onSave(values);
      }}
    />
  );
}
