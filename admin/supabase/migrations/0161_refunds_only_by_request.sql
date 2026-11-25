-- --------------------------------------------------------------------------
-- 0161: a refund is recorded only by approving a customer's request
--
-- admin_record_refund (0078) let an admin refund any order with no request
-- behind it. Refunds now start with the customer (request_refund, 0159) and
-- are approved in the Overview's Needs attention card, so nobody calls this
-- function directly any more: only admin_resolve_refund_request does, and as a
-- security definer function it runs it as its owner, which keeps the right.
-- --------------------------------------------------------------------------

revoke execute on function public.admin_record_refund(text, numeric, text, text)
  from public, anon, authenticated;

comment on function public.admin_record_refund(text, numeric, text, text) is
  'Records money returned to a customer, capped at the order total (0078). Called only by admin_resolve_refund_request since 0161; not executable by clients.';
