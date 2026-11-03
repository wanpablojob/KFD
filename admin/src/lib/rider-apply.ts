import { isValidPhMobile, normalisePhone } from "./rider-validation.ts";

/**
 * The website's rider application (/drive), checked before it is sent.
 *
 * submit_rider_application() (0046) is the authority: it needs a name and a
 * contact number and fills the rest in. This catches the same gaps in the
 * browser, with a sentence the applicant can act on, and holds the phone to
 * the Philippine mobile shape the dispatchers call.
 */

/** Where the application lives; the sign-in callback lets any account land here. */
export const DRIVE_PATH = "/drive";

export type VehicleType = "motorcycle" | "scooter" | "bicycle" | "car";

export const VEHICLES: { value: VehicleType; label: string }[] = [
  { value: "motorcycle", label: "Motorcycle" },
  { value: "scooter", label: "Scooter" },
  { value: "bicycle", label: "Bicycle" },
  { value: "car", label: "Car" },
];

export interface RiderApplyForm {
  fullName: string;
  phone: string;
  city: string;
  vehicle: VehicleType;
  licenceRef: string;
  orcrRef: string;
  governmentIdRef: string;
}

export const EMPTY_APPLICATION: RiderApplyForm = {
  fullName: "",
  phone: "",
  city: "",
  vehicle: "motorcycle",
  licenceRef: "",
  orcrRef: "",
  governmentIdRef: "",
};

/** The first problem to fix, or null when the form can be sent. */
export function applicationError(form: RiderApplyForm): string | null {
  if (form.fullName.trim().length < 2) return "Enter your full name.";
  if (!isValidPhMobile(normalisePhone(form.phone))) {
    return "Enter a mobile number like 0917 123 4567.";
  }
  if (!VEHICLES.some((v) => v.value === form.vehicle))
    return "Choose your vehicle.";
  // A motor vehicle on the road needs both; the review asks for them anyway,
  // so asking now saves the applicant a second round.
  if (form.vehicle !== "bicycle" && !form.licenceRef.trim()) {
    return "Enter your driver's licence number.";
  }
  if (form.vehicle !== "bicycle" && !form.orcrRef.trim()) {
    return "Enter your vehicle's OR/CR number.";
  }
  return null;
}
