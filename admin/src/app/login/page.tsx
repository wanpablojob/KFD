import { LoginPage as LoginScene } from "@/components/login-page";
import { safeNextPath } from "@/lib/safe-next";

export const metadata = {
  title: "Sign in — KFD",
};

/**
 * Explanations for the codes the gates send back. Living here rather than in
 * the form keeps them out of the client bundle's control flow and means a code
 * we do not recognise simply shows nothing.
 */
const MESSAGES: Record<string, string> = {
  "not-provisioned":
    "That account is not linked to an admin or a restaurant yet. Contact the KFD team to have it set up.",
  "no-restaurant":
    "Your merchant account has no restaurant attached. Contact the KFD team.",
  "lookup-failed":
    "We could not verify your access just now. Check your connection and try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;

  const code = typeof params.error === "string" ? params.error : null;
  const message = code ? (MESSAGES[code] ?? null) : null;

  return (
    <LoginScene next={safeNextPath(params.next as string | undefined)} message={message} />
  );
}
