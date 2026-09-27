import "server-only";

/**
 * Transactional order email.
 *
 * Resend is used because its free tier is 3,000 emails/month, the API is one
 * POST, and the limit is monthly rather than daily, so a busy day does not
 * silently drop the 101st email.
 *
 * Templates are inline HTML strings on purpose: pulling in a template engine
 * for four emails is not a trade worth making.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface OrderEmailItem {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderEmailData {
  reference: string;
  restaurant: string;
  customer: string;
  items: OrderEmailItem[];
  total: number;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string
  );
}

function peso(value: number): string {
  return `₱${Number(value).toFixed(2)}`;
}

function layout(title: string, inner: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#fafafa;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#27272a">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <div style="background:#b90e1f;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0;font-weight:700">KFD</div>
      <div style="background:#fff;padding:20px;border:1px solid #e4e4e7;border-top:0;border-radius:0 0 8px 8px">
        <h1 style="margin:0 0 12px;font-size:18px">${escapeHtml(title)}</h1>
        ${inner}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa">KFD · Kabankalan Food Delivery</p>
    </div>
  </body>
</html>`;
}

function itemTable(items: OrderEmailItem[]): string {
  if (!items?.length) return "<p>No items listed.</p>";

  return `<ul style="margin:0;padding:0;list-style:none">${items
    .map(
      (i) =>
        `<li style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee">
          <span>${escapeHtml(i.quantity)}&times; ${escapeHtml(i.name)}</span>
          <span>${peso(i.price * i.quantity)}</span>
        </li>`
    )
    .join("")}</ul>`;
}

function summary(order: OrderEmailData): string {
  return `<p style="margin:0 0 4px"><strong>${escapeHtml(order.reference)}</strong> · ${escapeHtml(order.restaurant)}</p>
    ${itemTable(order.items)}
    <p style="margin:12px 0 0;text-align:right;font-weight:700">Total ${peso(order.total)}</p>`;
}

export interface SendResult {
  ok: boolean;
  detail: string;
  skipped?: string;
}

export async function sendOrderEmail(
  to: string,
  subject: string,
  html: string
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) return { ok: false, detail: "RESEND_API_KEY is not configured" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.ORDER_EMAIL_FROM ?? "KFD <orders@notifications.kfd.ph>",
        to: [to],
        subject,
        html,
      }),
    });

    const body = await res.text();
    return { ok: res.ok, detail: res.ok ? body : `${res.status} ${body}` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Request failed",
    };
  }
}

export function newOrderEmail(order: OrderEmailData): {
  subject: string;
  html: string;
} {
  return {
    subject: `New order ${order.reference}`,
    html: layout(
      "New order received",
      `<p>You have a new order to prepare.</p>${summary(order)}`
    ),
  };
}

const STATUS_COPY: Record<string, string> = {
  confirmed: "Your order was accepted and is heading to the kitchen.",
  preparing: "Your order is being prepared now.",
  out_for_delivery: "Your order is on the way.",
  delivered: "Your order was delivered. Enjoy your meal.",
  cancelled: "Your order was declined by the restaurant.",
};

export function orderStatusEmail(
  order: OrderEmailData,
  status: string,
  reason?: string
): { subject: string; html: string } | null {
  const copy = STATUS_COPY[status];
  if (!copy) return null;

  const reasonBlock =
    status === "cancelled" && reason?.trim()
      ? `<p style="margin:12px 0 0;padding:10px 12px;background:#fef2f2;border-left:3px solid #b90e1f"><strong>Reason:</strong> ${escapeHtml(reason.trim())}</p>`
      : "";

  return {
    subject: `Order ${order.reference} — ${copy}`,
    html: layout(
      `Order ${order.reference} update`,
      `<p>${escapeHtml(copy)}</p>${reasonBlock}${summary(order)}`
    ),
  };
}

export { escapeHtml };
