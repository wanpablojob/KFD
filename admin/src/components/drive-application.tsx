"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  useSessionUser,
} from "@/lib/auth";
import {
  applicationError,
  DRIVE_PATH,
  EMPTY_APPLICATION,
  VEHICLES,
  type RiderApplyForm,
  type VehicleType,
} from "@/lib/rider-apply";
import {
  fetchMyApplication,
  submitApplication,
  type MyApplication,
} from "@/lib/supabase/rider-apply-queries";
import { APP_DOWNLOADS, PARTNER_TERMS } from "@/lib/site-content";
import {
  field,
  primaryButton,
  secondaryButton,
} from "@/components/marketing/styles";

const label = "text-sm font-semibold text-foreground";
const card = "rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8";

/**
 * The rider application, end to end: sign in or create an account, fill the
 * form, then see the application's status (received, approved, not approved).
 * Every write is submit_rider_application(), the same RPC the app uses, so an
 * application from here is reviewed exactly like one from a phone.
 */
export function DriveApplication() {
  const { user, loading } = useSessionUser();

  return (
    <main className="landing min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <Image
              src="/images/kabankalan/badge.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9"
            />
            <span className="font-display text-xl font-bold tracking-tight text-foreground">
              KFD
            </span>
          </Link>
          {user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Drive with KFD
          </h1>
          <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground">
            {PARTNER_TERMS.rider.blurb} {PARTNER_TERMS.rider.terms}
          </p>
        </div>

        {loading ? (
          <div className={card}>
            <p className="text-muted-foreground">Loading…</p>
          </div>
        ) : user ? (
          <Application email={user.email ?? ""} />
        ) : (
          <AccountStep />
        )}
      </div>
    </main>
  );
}

/** Step 1: an account to apply with. Google, or email and password. */
function AccountStep() {
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter your email address.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        const { signedIn } = await signUpWithPassword(
          email.trim(),
          password,
          DRIVE_PATH,
        );
        // Signed in: the session hook re-renders into the form.
        if (!signedIn) setCheckEmail(true);
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That did not work. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <div className={card}>
        <h2 className="font-display text-2xl font-bold">Check your email</h2>
        <p className="mt-2 text-muted-foreground">
          We sent a link to{" "}
          <span className="font-semibold text-foreground">{email}</span>. Open
          it to confirm your account, and it brings you back here to apply.
        </p>
      </div>
    );
  }

  return (
    <div className={card}>
      <h2 className="font-display text-2xl font-bold">
        {mode === "create" ? "Create your account" : "Sign in to apply"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Use this same account in the KFD app once you are approved.
      </p>

      <button
        type="button"
        onClick={() =>
          void signInWithGoogle(DRIVE_PATH).catch(() =>
            setError("Google sign-in did not start. Try again."),
          )
        }
        className={`${secondaryButton} mt-6 w-full`}
      >
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="drive-email" className={label}>
            Email
          </label>
          <input
            id="drive-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
            placeholder="you@example.com"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="drive-password" className={label}>
            Password
          </label>
          <input
            id="drive-password"
            type="password"
            autoComplete={
              mode === "create" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
            placeholder={mode === "create" ? "At least 8 characters" : ""}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy
            ? "Please wait…"
            : mode === "create"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {mode === "create" ? "Already have a KFD account? " : "New to KFD? "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "create" ? "signin" : "create");
            setError(null);
          }}
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          {mode === "create" ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}

/** Step 2 and after: the form, or where the application stands. */
function Application({ email }: { email: string }) {
  const [app, setApp] = useState<MyApplication | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [reapplying, setReapplying] = useState(false);
  // Bumped to read the application again (after sending, or on retry).
  const [version, setVersion] = useState(0);
  const load = useCallback(() => {
    setState("loading");
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let active = true;
    fetchMyApplication().then(
      (row) => {
        if (!active) return;
        setApp(row);
        setState("ready");
      },
      () => {
        if (active) setState("failed");
      },
    );
    return () => {
      active = false;
    };
  }, [version]);

  if (state === "loading") {
    return (
      <div className={card}>
        <p className="text-muted-foreground">Loading your application…</p>
      </div>
    );
  }
  if (state === "failed") {
    return (
      <div className={card}>
        <p className="text-muted-foreground">
          We could not load your application.
        </p>
        <button
          type="button"
          onClick={load}
          className={`${secondaryButton} mt-4`}
        >
          Try again
        </button>
      </div>
    );
  }

  if (app?.status === "pending") {
    return (
      <Status
        title="Application received"
        tone="wait"
        body={`Thanks, ${app.fullName.split(" ")[0]}. We review every application ourselves and will contact you on ${app.phone}. You can close this page; your status shows here whenever you sign in.`}
        app={app}
      />
    );
  }
  if (app?.status === "approved") {
    return (
      <Status
        title="You're approved"
        tone="good"
        body={`Welcome to KFD. Download the app and sign in with ${email || "this account"} to go online and take deliveries.`}
        app={app}
      >
        {APP_DOWNLOADS.android ? (
          <a href={APP_DOWNLOADS.android} className={`${primaryButton} mt-6`}>
            Download for Android
          </a>
        ) : null}
      </Status>
    );
  }
  if (app?.status === "rejected" && !reapplying) {
    return (
      <Status
        title="Application not approved"
        tone="bad"
        body={
          app.decisionNote ||
          "Your last application was not approved. You can fix the details and apply again."
        }
        app={app}
      >
        <button
          type="button"
          onClick={() => setReapplying(true)}
          className={`${primaryButton} mt-6`}
        >
          Apply again
        </button>
      </Status>
    );
  }

  return (
    <ApplicationForm
      initial={
        app
          ? {
              fullName: app.fullName,
              phone: app.phone,
              city: app.city,
              vehicle: app.vehicle,
              licenceRef: app.licenceRef ?? "",
              orcrRef: app.orcrRef ?? "",
              governmentIdRef: app.governmentIdRef ?? "",
            }
          : EMPTY_APPLICATION
      }
      onSent={() => {
        setReapplying(false);
        load();
      }}
    />
  );
}

function Status({
  title,
  body,
  tone,
  app,
  children,
}: {
  title: string;
  body: string;
  tone: "wait" | "good" | "bad";
  app: MyApplication;
  children?: React.ReactNode;
}) {
  const badge = {
    wait: "bg-secondary/20 text-foreground",
    good: "bg-primary text-primary-foreground",
    bad: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <div className={card}>
      <span
        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badge}`}
      >
        {tone === "wait"
          ? "Under review"
          : tone === "good"
            ? "Approved"
            : "Not approved"}
      </span>
      <h2 className="mt-4 font-display text-2xl font-bold">{title}</h2>
      <p className="mt-2 max-w-[60ch] leading-relaxed text-muted-foreground">
        {body}
      </p>
      <dl className="mt-6 grid gap-3 rounded-2xl bg-muted/60 p-4 text-sm sm:grid-cols-2">
        <Detail term="Name" value={app.fullName} />
        <Detail term="Mobile" value={app.phone} />
        <Detail term="Area" value={app.city} />
        <Detail
          term="Vehicle"
          value={
            VEHICLES.find((v) => v.value === app.vehicle)?.label ?? app.vehicle
          }
        />
        <Detail
          term="Applied"
          value={new Date(app.createdAt).toLocaleDateString()}
        />
      </dl>
      {children}
    </div>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function ApplicationForm({
  initial,
  onSent,
}: {
  initial: RiderApplyForm;
  onSent: () => void;
}) {
  const [form, setForm] = useState<RiderApplyForm>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<RiderApplyForm>) =>
    setForm((f) => ({ ...f, ...patch }));
  const needsPapers = form.vehicle !== "bicycle";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = applicationError(form);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      await submitApplication(form);
      onSent();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That did not go through. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`${card} flex flex-col gap-5`}
      noValidate
    >
      <div>
        <h2 className="font-display text-2xl font-bold">Your application</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We check these details before approving you. Nothing is shared outside
          KFD.
        </p>
      </div>

      <Input
        id="full-name"
        label="Full name"
        value={form.fullName}
        onChange={(v) => set({ fullName: v })}
        autoComplete="name"
        placeholder="Juan Dela Cruz"
      />
      <Input
        id="phone"
        label="Mobile number"
        value={form.phone}
        onChange={(v) => set({ phone: v })}
        autoComplete="tel"
        inputMode="tel"
        placeholder="0917 123 4567"
      />
      <Input
        id="city"
        label="Barangay or area (optional)"
        value={form.city}
        onChange={(v) => set({ city: v })}
        placeholder="Kabankalan City Proper"
      />

      <fieldset className="flex flex-col gap-2">
        <legend className={`${label} mb-1`}>Vehicle</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {VEHICLES.map((v) => (
            <label
              key={v.value}
              className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                form.vehicle === v.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              <input
                type="radio"
                name="vehicle"
                value={v.value}
                checked={form.vehicle === v.value}
                onChange={() => set({ vehicle: v.value as VehicleType })}
                className="sr-only"
              />
              {v.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Input
        id="licence"
        label={
          needsPapers
            ? "Driver's licence number"
            : "Driver's licence number (optional)"
        }
        value={form.licenceRef}
        onChange={(v) => set({ licenceRef: v })}
        placeholder="G01-23-456789"
      />
      <Input
        id="orcr"
        label={needsPapers ? "OR/CR number" : "OR/CR number (optional)"}
        value={form.orcrRef}
        onChange={(v) => set({ orcrRef: v })}
        placeholder="From your vehicle's registration"
      />
      <Input
        id="gov-id"
        label="Government ID number (optional)"
        value={form.governmentIdRef}
        onChange={(v) => set({ governmentIdRef: v })}
        placeholder="PhilSys, UMID, passport…"
      />

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Sending…" : "Send application"}
      </button>
      <p className="text-xs text-muted-foreground">
        By applying you agree to the{" "}
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}

function Input({
  id,
  label: text,
  value,
  onChange,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  inputMode?: "tel" | "text";
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`drive-${id}`} className={label}>
        {text}
      </label>
      <input
        id={`drive-${id}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={field}
        maxLength={120}
        {...rest}
      />
    </div>
  );
}
