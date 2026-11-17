-- --------------------------------------------------------------------------
-- 0150: KFD does not pay shops; the rider does, at pickup
--
-- 0138 assumed the customer's cash came to KFD and KFD then owed each shop
-- its food, less a commission. 0147 changed the money: the rider pays the shop
-- for the food at pickup, so KFD never holds a shop's money and never owes it.
-- Every screen that showed or settled that debt is gone; these functions are
-- what is left of it, callable by any admin or merchant and answering a
-- question that no longer has a meaning.
--
-- The tables stay. restaurant_payouts and orders.restaurant_payout_id may hold
-- payments already made, and platform_settings.commission_pct is the rate
-- they were made at. They are history, not a running process: nothing reads
-- or writes them after this migration.
-- --------------------------------------------------------------------------

drop function if exists public.admin_pay_restaurant(text, text, text);
drop function if exists public.admin_restaurant_owed(text);
drop function if exists public.merchant_owed();
drop function if exists public.restaurant_owed(text);
drop function if exists public.admin_set_commission(numeric);
drop function if exists public.admin_commission();

comment on table public.restaurant_payouts is
  'Payments KFD made to shops under 0138, before riders paid shops at pickup (0147). History only since 0150.';
comment on table public.platform_settings is
  'Platform-wide settings; one row (0138). commission_pct is unused since 0150: KFD does not hold or settle shop money.';
