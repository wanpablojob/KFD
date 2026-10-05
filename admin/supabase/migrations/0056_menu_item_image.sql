-- --------------------------------------------------------------------------
-- menu_items.image_url
--
-- A menu item can carry one image URL. Upload/storage is out of scope here: the
-- column holds a URL that the admin/merchant surface will set once an upload
-- pipeline exists, and the storefront simply renders it when present. Null means
-- no image, which is the current state of every row.
-- --------------------------------------------------------------------------

alter table public.menu_items
  add column if not exists image_url text;

comment on column public.menu_items.image_url is
  'Optional image URL for the item. Null when none has been set; the app then renders text only.';
