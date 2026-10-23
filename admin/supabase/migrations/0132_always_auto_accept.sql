-- --------------------------------------------------------------------------
-- 0132: every order is accepted the moment it is placed, for every shop
--
-- 0121 made automatic acceptance the default but left each shop a switch to
-- put orders back in front of it to accept or reject. The owner wants no
-- accept/reject step at all: an order comes in, the shop is told, and the
-- rider is offered it. So every shop is switched on and the switch goes.
--
-- The column, the trigger that reads it and the five-minute fallback stay:
-- with every shop on they do nothing extra, and removing them would mean
-- rebuilding order placement for no change in behaviour. A shop that cannot
-- make an order still cancels it, which tells the customer.
-- --------------------------------------------------------------------------

update public.restaurants set auto_accept = true where auto_accept is distinct from true;

drop function if exists public.merchant_set_auto_accept(boolean);

comment on column public.restaurants.auto_accept is
  'Always true since 0132: an order is accepted when placed and the shop is notified. Kept because the 0121 trigger and fallback read it.';
