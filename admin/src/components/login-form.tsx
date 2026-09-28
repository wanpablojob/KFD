"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPassword, signOut } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-next";
import { fetchUserRole } from "@/lib/role";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/field";
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon, ShieldIcon } from "./ui/icons";

const NOT_PROVISIONED =
  "This account is not linked to an admin or a restaurant yet. Contact the KFD team.";
const NO_RESTAURANT =
  "Your merchant account has no restaurant attached. Contact the KFD team.";

/**
 * One sign-in form for both roles. After the password is accepted it resolves
 * app_users and sends the user to the console their role actually permits,
 * rather than dropping everyone at / and letting the gates bounce half of
 * them. Both gates still re-check the role, so this routing is convenience
 * rather than the access control.
 */
export function LoginForm({
  next,
  message,
}: {
  next: string | null;
  message: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const target = safeNextPath(next);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!form.email || !form.password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      await signInWithPassword(form.email, form.password);
      const { role, restaurantId } = await fetchUserRole();

      if (role === "admin") {
        router.replace(target ?? "/");
        return;
      }

      if (role === "merchant" && restaurantId) {
        router.replace(target ?? "/merchant");
        return;
      }

      // The password was valid but the account has no permitted surface. Drop
      // the session so the browser is not left holding credentials that can
      // only ever fail.
      await signOut().catch(() => {});
      setError(role === "merchant" ? NO_RESTAURANT : NOT_PROVISIONED);
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to sign in. Please try again.",
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="email">Email address</Label>
        <div className="relative">
          <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@kfd.ph"
            className="h-11 pl-9"
            value={form.email}
            onChange={handleChange}
            error={Boolean(error)}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="mb-1.5 text-xs font-medium text-primary hover:underline"
          >
            Forgot password?
          </a>
        </div>
        <div className="relative">
          <LockIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            className="h-11 pl-9 pr-10"
            value={form.password}
            onChange={handleChange}
            error={Boolean(error)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {message && !error ? (
        <p
          role="status"
          className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-foreground"
        >
          {message}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" className="h-11 w-full" size="lg" loading={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/80">
        <ShieldIcon
          className={`h-3.5 w-3.5 ${loading ? "animate-pulse" : ""}`}
        />
        Credentials are verified by Supabase Auth
      </p>
    </form>
  );
}
