/**
 * How an order is paid for, in words a rider can act on.
 *
 * `cash` is the only method that puts an obligation on the rider: they are
 * carrying the restaurant's money and have to collect it. That is shown
 * separately and prominently.
 *
 * The other two are named as methods, not as "Paid". Nothing in the schema
 * records that an e-wallet or card payment actually settled -- there is no
 * payment gateway and no settled flag on `orders` -- so a label claiming payment
 * would be a guess, and the one guess a rider might act on ("it's already paid,
 * I can hand it over") is exactly the wrong one to make.
 */

export const CASH_PAYMENT = "cash";

export function isCashPayment(payment: string): boolean {
  return payment === CASH_PAYMENT;
}

export function paymentLabel(payment: string): string {
  switch (payment) {
    case "cash":
      return "Cash on delivery";
    case "e_wallet":
      return "e-wallet";
    case "card":
      return "card";
    default:
      // An enum value this build has not seen is shown as itself rather than
      // dropped, so a new method is visible instead of blank.
      return payment;
  }
}
