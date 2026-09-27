import { Suspense } from "react";
import { MerchantLoginForm } from "@/components/merchant/merchant-login-form";
import { Spinner } from "@/components/ui/button";

export default function MerchantLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
          >
            KFD
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Merchant sign in
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your restaurant&apos;s orders and menu.
            </p>
          </div>
        </div>

        <div className="rounded-(--radius-card) border border-border bg-card p-6 shadow-sm">
          <Suspense
            fallback={
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            }
          >
            <MerchantLoginForm />
          </Suspense>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          KFD staff?{" "}
          <a href="/login" className="text-primary underline-offset-4 hover:underline">
            Use the admin sign in
          </a>
        </p>
      </div>
    </div>
  );
}
