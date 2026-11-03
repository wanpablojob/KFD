import type { Metadata } from "next";
import { DriveApplication } from "@/components/drive-application";
// The landing page's type scale: without it globals.css shrinks the headings.
import "../landing.css";

/**
 * Drive with KFD: the real rider application, on the website.
 *
 * The landing page's "Drive with KFD" card links here. The visitor signs in
 * or creates an account, applies, and the application lands in the same
 * review queue as one sent from the app (Riders, Applications). Approval is
 * still an admin's decision; this page only shows where it stands.
 */
export const metadata: Metadata = {
  title: "Drive with KFD — Kabankalan Food Delivery",
  description:
    "Apply to deliver for KFD in Kabankalan City. Create an account, send your details, and we review your application.",
};

export default function DrivePage() {
  return <DriveApplication />;
}
