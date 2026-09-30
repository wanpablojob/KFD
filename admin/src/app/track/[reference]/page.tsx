import { OrderTracker } from "@/components/track/order-tracker";

export const metadata = {
  title: "Track your order — KFD",
  description: "Check the live status of your KFD order.",
  robots: { index: false, follow: false },
};

/**
 * Public order tracking. No login, deliberately: most customers are walk-ins
 * with no account, and this prompt may not build one.
 *
 * The route is outside the (dashboard) group, so it does not inherit AuthGate
 * or the admin shell. That is the point -- it is the only customer-facing page
 * in the app, and it is reachable by a signed-out browser.
 *
 * Everything it displays comes from public.track_order(), which decides what is
 * readable rather than this page deciding what to show. The reference is the
 * only secret here, so it is never echoed back into a link, an analytics call,
 * or a heading that a referrer header could leak.
 */
export default async function TrackPage({ params }: PageProps<"/track/[reference]">) {
  const { reference } = await params;
  const clean = decodeURIComponent(reference).trim();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-8 px-4 py-12">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Kabankalan Food Delivery
        </p>
        <h1 className="text-2xl font-semibold text-card-foreground">
          Track your order
        </h1>
      </header>

      <section className="rounded-(--radius-card) border border-border bg-card p-6">
        {clean ? (
          <OrderTracker reference={clean} />
        ) : (
          <p className="text-sm text-muted-foreground" data-tracking-state="missing">
            No reference was given.
          </p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Anyone with this reference can see this page, so treat it like a password
        and do not post it publicly.
      </p>
    </main>
  );
}
