import Image from "next/image";
import { LoginForm } from "@/components/login-form";

export const metadata = {
  title: "Sign in — KFD Admin",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-hover" />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5 blur-2xl" />

        <div className="relative flex items-center gap-3">
          <Image
            src="/images/kabankalan/logo.jpg"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-lg bg-white/90 object-contain p-1 shadow-lg"
          />
          <span className="text-xl font-bold tracking-tight text-white">
            KFD Admin
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-white">
            Kabankalan City Food Delivery operations, one dashboard.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-primary-foreground/80">
            Track orders, manage restaurants and riders, and keep Kabankalan
            City Proper&apos;s food delivery running smoothly — all in real
            time.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-6">
            {[
              { value: "1,284", label: "Orders today" },
              { value: "86", label: "Active restaurants" },
              { value: "142", label: "Riders online" },
            ].map((s) => (
              <div key={s.label}>
                <dt className="text-2xl font-bold text-white">{s.value}</dt>
                <dd className="mt-1 text-xs text-primary-foreground/70">
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} KFD — Kabankalan City Proper, Negros
          Occidental
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <Image
                src="/images/kabankalan/logo.jpg"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 rounded-lg border border-border object-contain p-1 shadow-sm"
              />
              <span className="text-xl font-bold tracking-tight text-foreground">
                KFD Admin
              </span>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome back
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access the Kabankalan Food Delivery operations console.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}