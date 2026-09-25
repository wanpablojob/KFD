"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPassword } from "@/lib/auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/field";
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon, ShieldIcon } from "./ui/icons";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", remember: false });

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = event.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
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
      router.replace("/");
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

      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
        <Checkbox name="remember" checked={form.remember} onChange={handleChange} />
        Keep me signed in
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" className="h-11 w-full" size="lg" loading={loading}>
        {loading ? "Signing in…" : "Sign in to console"}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/80">
        <ShieldIcon
          className={cn("h-3.5 w-3.5", loading ? "animate-pulse" : "")}
        />
        Credentials are verified by Supabase Auth
      </p>
    </form>
  );
}