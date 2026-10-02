-- 0038 left rider_payouts on Supabase's default table privileges, so a table
-- read reached PostgREST and was then emptied by RLS: anon asking for
-- /rest/v1/rider_payouts got 200 and []. No row ever leaked, but the table
-- relied on the policy being correct rather than on the grant.
--
-- order_offers gets this right (0035): revoke the privilege so the request is
-- refused outright. Payout rows are the most sensitive thing in the rider
-- domain and every legitimate read already goes through the security definer
-- RPCs, so match that and drop the table privileges entirely.
revoke all on table public.rider_payouts from anon;
revoke all on table public.rider_payouts from authenticated;
grant all on table public.rider_payouts to service_role;