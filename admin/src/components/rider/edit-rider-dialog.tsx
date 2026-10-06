"use client";

import { EntityDialog, type DialogField } from "@/components/ui/entity-dialog";
import {
  validateRiderFields,
  type RiderFieldError,
} from "@/lib/rider-validation";
import type { Rider } from "@/lib/types";

const FIELDS: DialogField[] = [
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

/**
 * Edit one rider.
 *
 * `existingEmails` is the other riders' addresses, so saving without touching
 * the email is not reported as a duplicate of yourself. EntityDialog renders
 * whatever message is thrown, which is why every rule is reported in one go.
 */
export function EditRiderDialog({
  rider,
  existingEmails,
  onClose,
  onSave,
}: {
  rider: Rider;
  existingEmails: readonly string[];
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  return (
    <EntityDialog
      open
      title={`Edit ${rider.name}`}
      fields={FIELDS}
      initial={{
        name: rider.name,
        email: rider.email,
        phone: rider.phone,
        city: rider.city,
        vehicle: rider.vehicle,
        status: rider.status,
      }}
      onClose={onClose}
      onSave={async (values) => {
        const found: RiderFieldError[] = validateRiderFields(
          {
            name: values.name ?? "",
            email: values.email ?? "",
            phone: values.phone ?? "",
            city: values.city ?? "",
          },
          existingEmails,
          rider.email,
        );
        if (found.length > 0) {
          throw new Error(
            found
              .map(
                (error) =>
                  `${
                    FIELDS.find((field) => field.key === error.field)?.label ??
                    error.field
                  }: ${error.message}`,
              )
              .join(" "),
          );
        }
        await onSave(values);
      }}
    />
  );
}