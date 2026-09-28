/**
 * Maps a failed `/api/orders/notify` response to something a UI can branch on.
 *
 * Prompt 1.4 stopped the raw response body reaching the browser, but left the
 * caller with prose only: every failure rendered the same sentence, so the UI
 * could not tell "you are not allowed to do that" from "email is not
 * configured" from "the order id was not found". Those need different people to
 * act, which is the whole point of distinguishing them.
 *
 * Kept in its own module, free of React and of the Supabase client, so the
 * mapping is directly unit-testable and can be imported by the merchant UI.
 */

export type NotifyFailureCode =
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "service_error"
  | "unreachable"
  | "unknown";

export interface NotifyFailure {
  code: NotifyFailureCode;
  /** A sentence safe to render in the merchant UI. */
  detail: string;
  /** True when retrying later could plausibly succeed. */
  retryable: boolean;
}

/** The order was saved; only the customer notification failed. */
const SAVED = "Order saved, but ";

/**
 * `unreachable` is for a request that never got a response at all (DNS, offline,
 * a thrown fetch). It has no HTTP status, so it is handled separately by
 * `notifyTransportFailure`.
 */
export function classifyNotifyStatus(status: number): NotifyFailure {
  if (status === 401 || status === 403) {
    return {
      code: "unauthorized",
      detail:
        `${SAVED}the customer was not emailed because your account is not allowed to send notifications. Ask an administrator to check your permissions.`,
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      code: "not_found",
      detail:
        `${SAVED}the email service could not find that order, so the customer was not notified. Refresh the page and try again.`,
      retryable: true,
    };
  }
  if (status === 429) {
    return {
      code: "rate_limited",
      detail:
        `${SAVED}too many emails were sent just now, so the customer was not notified. Try again in a few minutes.`,
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      code: "service_error",
      detail:
        `${SAVED}the email service had a problem, so the customer was not notified. Ask an administrator to check the email settings.`,
      retryable: true,
    };
  }
  return {
    code: "unknown",
    detail: `${SAVED}the customer was not emailed. Ask an administrator to check the email settings.`,
    retryable: false,
  };
}

/** No HTTP response was received: the request threw or the network is down. */
export function notifyTransportFailure(): NotifyFailure {
  return {
    code: "unreachable",
    detail:
      `${SAVED}we could not reach the email service, so the customer was not notified. Check your connection and try again.`,
    retryable: true,
  };
}
