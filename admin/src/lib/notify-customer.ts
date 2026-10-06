/**
 * Which customer record receives the email for an order.
 *
 * The lookup joins on the auth account id, never on the customer's name. Name
 * was the original key and it was wrong two ways at once: the admin customer
 * editor exposes the name field, so renaming a customer silently stopped their
 * order emails; and two customers sharing a name resolved to whichever row came
 * back, so one of them got the other's mail. Neither failure announces itself --
 * the merchant still sees the status change, only the customer hears nothing.
 *
 * orders.customer_user_id and customers.user_id are both real identifiers
 * (0012 and 0066), so the primary lookup is exact.
 */

export type CustomerLookup = {
  // supabase-js's builder generics are not worth reproducing here; this only
  // has to say that `from()` returns something chainable. The column being
  // filtered on is stated at each call below and pinned by the test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function resolveCustomerEmail(
  supabase: CustomerLookup,
  order: { customer: string | null; customer_user_id: string | null },
): Promise<string | null> {
  if (order.customer_user_id) {
    const { data } = await supabase
      .from("customers")
      .select("email")
      .eq("user_id", order.customer_user_id)
      .maybeSingle();
    if (data?.email) return data.email;
  }

  // Only reached when the order carries no account id (placed before 0012's
  // backfill, or created by hand) or the id matches no customer row. A name
  // match is the best answer available for those orders. It stays a fallback
  // rather than the primary key for the reason above: it is a guess, and a
  // guess is acceptable for legacy rows but must not be the default.
  if (order.customer) {
    const { data } = await supabase
      .from("customers")
      .select("email")
      .eq("name", order.customer)
      .maybeSingle();
    if (data?.email) return data.email;
  }

  return null;
}
