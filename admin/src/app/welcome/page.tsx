import { redirect } from "next/navigation";

/**
 * The landing page now lives at `/` (src/app/page.tsx). This route only exists
 * so the `/welcome` path published a moment ago keeps working instead of 404ing
 * for anyone who followed the link from the login screen.
 */
export default function WelcomeRedirect() {
  redirect("/");
}
